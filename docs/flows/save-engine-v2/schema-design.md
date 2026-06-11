# 저장 구조 설계 — 진술 엔진 (save-engine-v2)

> "저장 비종속"으로 정리한 모델(docs/product 01~10)을 실제 저장소(Postgres/Supabase·Qdrant·Neo4j)에 앉히는 설계. 이 문서를 보고 바로 마이그레이션을 뽑을 수 있는 수준을 목표로 한다.
>
> 이전 세대: [`save-engine-v1`](../save-engine-v1/) (합성 문서 기반). 08-implementation-vs-model이 정리했듯 v1(합성 문서) → v2(진술)는 같은 문제의 두 세대다.

---

## 0. 이 문서가 정하는 것 / 정하지 않는 것

- **정한다**: 진술·원본·관계·변경셋·소유(Space)를 담는 테이블 스키마, 제약, 인덱스, RLS, 트리거, 그리고 추출·임베딩 동기화의 DB 계약(큐·RPC·상태 컬럼·벡터 payload).
- **정하지 않는다**: 검색/조회 API(tRPC 라우터·서비스), worker의 실제 구현 코드(LLM 추출 로직, Voyage 임베딩 호출, Qdrant 클라이언트), 관계 엔진(진술을 잇는 판단 로직), Neo4j 그래프 동기화. 이들은 후속 작업.

---

## 1. 배경 — 무엇을, 왜

기존 구현체(v1)는 맥락의 최소 단위를 **합성 문서**(`memories`)로 잡고, 새 정보가 올 때마다 그 본문을 다시 썼다. 새 모델은 최소 단위를 **진술(Statement)**로 내리고, 합성 문서는 "저장하는 진실"이 아니라 **꺼낼 때 진술을 모아 만드는 뷰**로 강등한다.

진술과 합성 문서는 데이터가 호환되지 않으므로(한쪽은 통문서 본문, 한쪽은 문장 단위 진술), 기존 테이블을 **드랍하고 새로 짠다**. prod/staging 데이터는 모두 폐기 가능.

- 드랍: `memories`, `histories`, `memory_revisions`, `save_jobs` (+ `memory_sync` 큐, `fetch_pending_memories` 류 RPC)
- 보존: `sessions`, `messages`, `profiles`, `events`, `ingestion_status` enum, `update_updated_at()` 함수

---

## 2. 박힌 결정 (재논쟁 금지)

1. **원자 = 진술(Statement).** 합성 문서는 pull 시점 뷰로 강등.
2. **소유는 user 직접이 아니라 Space 한 겹 건너.** 오늘은 사람당 개인 Space 1개(Member 1명) 자동 생성, 모든 기록에 `space_id`.
3. **유효성 = 존재 + 대체(replaces) 없음.** 별도 시각 필드(effectiveAt) 없음. 참·거짓 미판단.
4. **`author_id`는 사람 산물에만** (원본·사람 주도 변경셋). 엔진 산물(진술·관계)엔 없음.
5. **관계·변경셋은 스키마에 자리만, 엔진은 미연결** (이 작업 스코프 기준).
6. **진술 종류 claim/question/todo 다 받음.** 확신도는 claim에만.
7. **원본은 불변** — "수정"은 폐기(archive)+재생성으로 표현. **진술의 `modify`는 모델 연산으로 존재하나(07이 "진술을 modify하면 관계 재평가"로 명시), 첫 출시엔 직접 수정 기능을 안 만들어 실제로 생성되지 않는다(09 미정).**

---

## 3. 전체 그림

```
auth.users ──(가입 트리거)──> spaces ──< space_members >── (user)
                                 │
        ┌────────────────────────┼─────────────────────────┐
        │ (모든 기록은 space_id로 소유)                       │
   sources              statements              statement_relations
   (원본·박제)           (진술·원자)              (관계, 자리만)
      │                  │   │                     │ from_id / to_id
      └──< statement_sources >──┘                  └──> statements
            (SourceRef, 다중)

   changesets ──< changes >── (polymorphic target: statement|source|relation)
   (변경 묶음)    (개별 연산)

   [동기화] sources.extraction_status ──추출(LLM)──> statements
            statements.ingestion_status ──임베딩(Voyage)──> Qdrant
```

소유 모델: `spaces`(소유 칸) + `space_members`(사람↔칸 명단). 모든 기록 테이블은 `space_id`로 소유를 묶고, RLS는 "내가 그 Space의 멤버인가"로 판정한다. 사람당 개인 Space 1개를 가입 트리거가 자동 생성한다(Member 1명).

---

## 4. 단위별 스키마

> 공통 규칙: 모든 시각 컬럼은 `timestamptz`. mutable 테이블은 `updated_at` + `update_updated_at()` 트리거. 직접 쓰기는 막고(SELECT-only RLS) 모든 변경은 RPC(SECURITY DEFINER) 경유 — append-only 이력·원자성 보장.

### 4.1 소유 층

```sql
-- 소유 칸
CREATE TABLE spaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,                       -- 채우는 정책은 구현 단계(트리거). 자리만 nullable
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 사람 ↔ 칸 명단 (조인). 멀티플레이어 전환 = 여기에 row 추가
CREATE TABLE space_members (
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        space_role NOT NULL,        -- owner | member (자리만, 1인 단계 무동작)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);
```

- **주인은 `owner_id` 컬럼이 아니라 `space_members.role='owner'`로 표현** — "개인=팀, 멤버 수만 다른 같은 단위"(10) 정의를 지키려고 조인으로 둔다.
- **종류(kind) 컬럼 없음** — 개인/팀은 멤버 수로 판별.
- Organization 층은 안 만든다. 나중에 `spaces`에 nullable `org_id`를 붙이면 끼워진다(콘텐츠 소유와 직교).

### 4.2 원자 층

```sql
-- 원본: 무손실 박제 + 추출 작업 상태
CREATE TABLE sources (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id                 uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- 누가 넣었나(사람 산물)
  session_id               uuid REFERENCES sessions(id) ON DELETE SET NULL,    -- 어느 대화에서 왔나(선택)
  body                     text NOT NULL,                 -- 원문 그대로
  status                   source_status NOT NULL DEFAULT 'active',            -- active | archived
  -- 추출 작업 추적 (save_jobs 흡수)
  extraction_status        ingestion_status NOT NULL DEFAULT 'pending',        -- pending|completed|failed
  extraction_retry_count   int NOT NULL DEFAULT 0,
  last_extraction_attempt  timestamptz,
  error_message            text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- 진술: 새 원자
CREATE TABLE statements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  content     text NOT NULL,                              -- 그 '왜' 자체
  type        statement_type NOT NULL,                    -- claim | question | todo
  confidence  statement_confidence,                       -- certain | guess, claim에서만
  status      statement_status NOT NULL DEFAULT 'active', -- active | archived
  -- 임베딩 동기화 (1진술 = 1벡터)
  ingestion_status        ingestion_status NOT NULL DEFAULT 'pending',
  ingestion_retry_count   int NOT NULL DEFAULT 0,
  last_ingestion_attempt  timestamptz,
  error_message           text,                           -- 임베딩 실패 이유 (sources의 추출 실패와 대칭)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- 확신도 무결성: claim이면 반드시 있고, 그 외엔 반드시 없음
  CONSTRAINT chk_confidence_only_claim CHECK (
    (type = 'claim' AND confidence IS NOT NULL)
    OR (type <> 'claim' AND confidence IS NULL)
  )
);

-- SourceRef: 진술 → 원본 포인터 (다중)
CREATE TABLE statement_sources (
  statement_id  uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  locator       jsonb,                    -- 원본 내 위치, 자리만(안 채움)
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (statement_id, source_id)
);
```

- `statements`엔 `author_id` 없음 — 엔진 산물. 출처는 `statement_sources → sources.author_id`로 파생.
- `content` 수정(`modify`)은 모델 연산으로 존재하나(07: "진술을 `modify`하면 관계 재평가"), **첫 출시엔 직접 수정 기능을 안 만들어 미사용**(09 미정). `updated_at`은 `status`/동기화 같은 메타 변경 추적용. (원본과 달리 진술 modify를 막는 제약은 두지 않는다 — 07이 진술 modify를 허용하므로.)
- **`statement_sources`는 양끝이 같은 Space여야 함**(추출 관계는 Space를 가로지르지 않음). `BEFORE INSERT` 트리거로 `statement.space_id = source.space_id` 강제 (의미상 확정적이라 지금 박는다).
- `sources`는 임베딩하지 않음(원본은 의미로 다루지 않음). 임베딩 대상은 진술뿐.

### 4.3 변경 층

```sql
-- 변경셋: 한 번의 변경 묶음 (histories 대체)
CREATE TABLE changesets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type        changeset_type NOT NULL,    -- ingestion|conflict|merge|manual|revert
  status      changeset_status NOT NULL,  -- pending | applied (DEFAULT 없음 — 생성 RPC가 명시적으로 정함)
  source_id   uuid REFERENCES sources(id)    ON DELETE CASCADE,   -- ingestion이면 어느 원본 (같은 Space라 동반 삭제)
  reverts_id  uuid REFERENCES changesets(id) ON DELETE CASCADE,   -- revert면 되돌리는 대상
  author_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- 변경을 일으킨 주체(사람). 엔진이면 NULL. 계정 삭제 시 NULL로 보존
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- type별 무결성. author_id는 "엔진 type은 반드시 NULL"만 DB로 강제하고,
  -- 사람 type의 author 필수는 생성 RPC가 보장한다 (계정 삭제 시 SET NULL과 양립시키기 위함 — 4.5).
  CONSTRAINT chk_changeset_shape CHECK (
    (type='ingestion' AND source_id IS NOT NULL AND reverts_id IS NULL) OR
    (type='revert'    AND reverts_id IS NOT NULL AND source_id IS NULL) OR
    (type='manual'    AND source_id IS NULL AND reverts_id IS NULL) OR
    (type IN ('conflict','merge') AND source_id IS NULL AND reverts_id IS NULL AND author_id IS NULL)
  )
);

-- 개별 연산
CREATE TABLE changes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changeset_id  uuid NOT NULL REFERENCES changesets(id) ON DELETE CASCADE,
  action        change_action NOT NULL,        -- create | archive | modify
  target_type   change_target_type NOT NULL,   -- statement | relation | source
  target_id     uuid NOT NULL,                 -- 느슨한 polymorphic (FK 없음 — 이력 보존)
  data          jsonb,                         -- create/modify에서. archive엔 없음
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_data_by_action CHECK (
    (action IN ('create','modify') AND data IS NOT NULL)
    OR (action = 'archive' AND data IS NULL)
  ),
  CONSTRAINT chk_no_source_modify CHECK (
    NOT (target_type = 'source' AND action = 'modify')   -- 원본은 불변
  )
);
```

- **첫 출시에 실제로 생성되는 type은 `ingestion`(저장)·`manual`(직접 빼기)·`revert`(되돌리기) 3개.** `conflict`·`merge`는 관계 엔진이 만들어 미연결(스키마는 받아둠).
- **`changesets.author_id`는 "변경을 일으킨 주체"** — `ingestion`이면 원본을 제출한 *사람*이다(엔진이 진술을 추출해도 변경을 일으킨 주체는 제출자). 결정 #4의 "엔진 산물엔 author 없음"은 진술·관계 같은 *산출물*에 대한 것이라 축이 다르다. DB는 엔진 type(`conflict`/`merge`)의 `author IS NULL`만 강제하고, 사람 type의 author 필수는 생성 RPC가 보장한다.
- **append-only 되돌리기**: `applied`를 되돌릴 때 status를 바꾸지 않고 `revert` 변경셋을 *추가*한다(07).
- **`changes.target_id`는 FK 없는 polymorphic** — 대상이 3종(statement/source/relation)이라 단일 FK가 불가능한 게 1차 이유다. 더해서 이력 로그라, Space 삭제(4.5)로 대상이 사라져도 "무엇을 했는지"가 남아야 한다. 생성 시 대상 존재 보장은 RPC가 한다. (개별 기록은 hard-delete가 없어 평소엔 대상이 늘 존재한다.)
- `data` 형식(modify의 before/after 보존 등)은 구현 단계로 열어둠.

### 4.4 관계 층 (자리만, 엔진 미연결)

```sql
CREATE TABLE statement_relations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,  -- 관계를 만든 쪽 소유
  type        relation_type NOT NULL,     -- supports|conflicts|replaces|resolves
  from_id     uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  to_id       uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  status      relation_status NOT NULL DEFAULT 'active',  -- active | archived
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_no_self_relation CHECK (from_id <> to_id)
);
```

- **`same-space`를 강제하지 않는다** — `statement_sources`와 정반대. 관계는 Space를 가로지를 수 있다(다른 사람 진술에 내가 반박/근거를 닮, 10). `space_id`는 만든 쪽의 것이고 끝점은 다른 Space일 수 있다.
- `author_id` 없음 — 엔진 산물. 소유는 `space_id`로만.
- `conflicts`는 논리상 대칭이나 저장은 방향(from/to)으로 두고 동작에서 대칭 처리.
- **엔진 단계로 미룬 것**: "끝점 archived → 관계 연쇄 archived" 트리거, `(from_id, to_id, type)` 중복 방지 unique. 첫 출시엔 관계 row가 (엔진 미연결이라) 안 생기므로 자리만.

### 4.5 삭제·보존 정책 (전 테이블 공통)

개별 기록(source·statement·relation)에는 **hard-delete가 없다** — "빼기"는 전부 soft(`status='archived'`)다. 07이 열어둔 "완전 삭제(기밀 등)"는 후순위. 실제로 hard-delete가 일어나는 경로는 둘뿐이고, 이 둘이 모든 FK의 `ON DELETE`를 정한다:

| 경로 | 동작 |
|---|---|
| **Space 삭제** | 그 Space의 모든 기록이 `space_id` 경유 `CASCADE` 삭제 |
| **계정 삭제(`auth.users`)** | `author_id`가 `SET NULL` — 작성자만 비우고 기록은 Space에 보존(10: 사람이 떠나도 기록은 남는다) |

| FK | ON DELETE | 이유 |
|---|---|---|
| 모든 `space_id` | `CASCADE` | Space가 소유의 뿌리 |
| `author_id` (sources·changesets) | `SET NULL` | 계정 삭제 시 익명으로 기록 보존 |
| `session_id` (sources) | `SET NULL` | 대화가 지워져도 원본 보존 |
| `changesets.source_id`·`reverts_id` | `CASCADE` | 끝점은 같은 Space라 Space 삭제 시 동반 |
| `statement_sources`·`statement_relations`의 끝점 | `CASCADE` | hard-delete는 Space 삭제 때만 일어나므로 동반 |
| `changes.target_id` | (FK 없음) | polymorphic이라 단일 FK 불가 + 이력 보존(4.3) |

`author_id NOT NULL`을 CHECK로 박지 않은 이유가 여기 있다 — 계정 삭제 시 `SET NULL`과 충돌하기 때문. 사람 type의 author 필수는 쓰기가 전부 RPC 경유라 RPC가 보장한다.

---

## 5. 가로지르는 설계

### 5.1 RLS — "내 Space 것만 읽기" + "쓰기는 RPC만"

소유 판정을 헬퍼 함수 하나로 추출한다. 협업 단계에서 접근 규칙(공유·그룹)이 붙어도 이 함수 한 곳만 고치면 전 테이블에 반영된다.

```sql
CREATE OR REPLACE FUNCTION is_space_member(p_space_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = p_space_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
```

정책 패턴 (전 테이블 **SELECT만** 직접 허용, INSERT/UPDATE/DELETE 정책 없음 = 직접 쓰기 차단, RPC만 통과):

| 테이블 | SELECT USING |
|---|---|
| `spaces` | `is_space_member(id)` |
| `space_members` `sources` `statements` `changesets` `statement_relations` | `is_space_member(space_id)` |
| `statement_sources` | `statement_id IN (SELECT id FROM statements WHERE is_space_member(space_id))` |
| `changes` | `changeset_id IN (SELECT id FROM changesets WHERE is_space_member(space_id))` |

쓰기 무결성(changeset 원자성)은 RPC가, 읽기 격리는 RLS가 맡는다. (이미 v1의 `memory_revisions`가 검증한 SELECT-only + RPC-write 패턴의 전 테이블 확장.)

### 5.2 개인 Space 자동생성 트리거

이 스택 최초의 가입 훅. 소유의 뿌리(Space 존재)를 앱 누락 위험에서 떼어내 DB 불변식으로 박는다.

```sql
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE v_space_id uuid;
BEGIN
  INSERT INTO spaces (name) VALUES (NULL) RETURNING id INTO v_space_id;  -- name 정책은 구현 단계
  INSERT INTO space_members (space_id, user_id, role) VALUES (v_space_id, NEW.id, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

- **주의(구현 체크리스트)**: 트리거 실패는 가입 자체를 막는다 → 철저히 테스트. `SECURITY DEFINER` + `search_path` 고정 필수.
- **이전 검토 메모**: 트리거는 "가입 = 단순 부트스트랩(2-insert)"일 때만 옳다. 협업/조직 단계로 가서 가입 경로가 분화(개인/초대/회사 도메인)되면 앱 레이어로 이전한다. 스키마(`space_members`)는 안 바뀌고 생성 위치만 옮기면 되므로 전환 비용은 작다(되돌리기 싼 결정).

### 5.3 동기화 — 2단계 비동기 파이프

```
글 던짐
  → source 박제 (extraction_status=pending)
  → [worker] 추출(LLM): 진술 N개 + statement_sources + ingestion changeset(원자) 생성, extraction completed
       → statements (ingestion_status=pending)
       → [worker] 임베딩(Voyage): Qdrant upsert, ingestion completed
```

- 큐: `statement_sync`(v1의 `memory_sync` 대체). 저장/추출/임베딩 RPC가 `pgmq.send` notify.
- RPC 골격 (service_role, v1의 `fetch_pending_memories` 류 계승):
  - 추출: `fetch_pending_sources` / `complete_source_extraction` / `increment_source_extraction_retry`
  - 저장: `apply_ingestion_changeset` — source+statements+statement_sources+changeset+changes를 한 트랜잭션에 원자 생성
  - 임베딩: `fetch_pending_statements` / `complete_statement_ingestion` / `increment_statement_ingestion_retry`
- **Qdrant payload** (1진술 = 1 point, 청크 없음):
  ```
  { statement_id, space_id, content, type, confidence, created_at, embedding_model }
  ```
  검색 필터는 `space_id`(내가 멤버인 Space들) 경유로 격리. (`user_id` → `space_id` 전환.)
- **archived 진술의 벡터 = 선언적 동기화**: worker가 진술을 가져왔을 때 `status='active'`면 Qdrant upsert, `status='archived'`면 delete. archive 시 `ingestion_status`를 `pending`으로 되돌려 worker가 벡터를 제거한다. → 검색 공간이 깨끗해 search는 `space_id` 필터만으로 끝남(archived는 벡터가 없음).
- **Neo4j는 이번 스코프 밖** — 진술 관계 그래프 동기화는 관계 엔진과 함께 후속. 기존 Entity(핵심어) 그물은 `memories` 드랍과 함께 정지(핵심어는 09에서 보조·있으면 좋음으로 강등).

### 5.4 enum 타입 / 인덱스

```sql
-- enum (status 계열은 의미별 독립 진화 위해 분리)
CREATE TYPE space_role            AS ENUM ('owner','member');
CREATE TYPE source_status         AS ENUM ('active','archived');
CREATE TYPE statement_type        AS ENUM ('claim','question','todo');
CREATE TYPE statement_confidence  AS ENUM ('certain','guess');
CREATE TYPE statement_status      AS ENUM ('active','archived');
-- ingestion_status (pending|completed|failed)는 기존 것 재사용
CREATE TYPE changeset_type        AS ENUM ('ingestion','conflict','merge','manual','revert');
CREATE TYPE changeset_status      AS ENUM ('pending','applied');
CREATE TYPE change_action         AS ENUM ('create','archive','modify');
CREATE TYPE change_target_type    AS ENUM ('statement','relation','source');
CREATE TYPE relation_type         AS ENUM ('supports','conflicts','replaces','resolves');
CREATE TYPE relation_status       AS ENUM ('active','archived');
```

```
space_members        (user_id)                              -- 매 RLS의 is_space_member 탐색
sources              (space_id, created_at DESC)
                     (id) WHERE extraction_status='pending'  -- 추출 worker 폴링
statements           (space_id, created_at DESC)
                     (id) WHERE ingestion_status='pending'   -- 임베딩 worker 폴링
statement_sources    (source_id)                             -- 원본→진술 역방향(원본 빼기)
changesets           (space_id, created_at DESC)
changes              (changeset_id)
statement_relations  (from_id), (to_id), (space_id)
```

---

## 6. 마이그레이션 파일 순서

의존성이 순서를 강제한다. 큰 기능이라 층별 1파일로 묶는다. (각 층 파일에 그 테이블의 RLS 정책 포함 — supabase 규칙: 새 테이블엔 RLS 필수.)

1. **기존 드랍** — `memory_revisions → histories → memories → save_jobs` + `memory_sync` 큐 + `fetch_pending_memories` 류 RPC. (보존: `ingestion_status` enum, `update_updated_at()`, `sessions/messages/profiles/events`)
2. **Space 층** — `space_role` enum + `spaces` + `space_members` + 가입 트리거 + `is_space_member()` + RLS
3. **원자 층** — enums + `sources` + `statements` + `statement_sources` + same-space 트리거 + RLS
4. **변경 층** — enums + `changesets` + `changes` + RLS
5. **관계 층** — enums + `statement_relations` + RLS
6. **동기화** — `statement_sync` 큐 + 추출/저장/임베딩 RPC

각 파일은 `supabase migration new <name>`로 생성. 작성 후 `supabase db reset && supabase gen types ... > apps/server/src/infra/database.types.ts` 실행하고 생성 타입을 함께 커밋.

---

## 7. 스코프 경계

| 항목 | 이번(NEM-121) | 후속 |
|---|---|---|
| 진술·원본·관계·변경·Space 테이블 | ✅ | |
| RLS·가입 트리거·same-space 트리거 | ✅ | |
| 추출·임베딩 동기화 DB 계약(큐·RPC·상태·payload) | ✅ | worker 구현 코드 |
| 관계 엔진(진술 잇기 판단) | 자리만 | ✅ |
| Neo4j 그래프 동기화 | | ✅ |
| 검색/조회 API(tRPC) | | ✅ |

---

## 8. 후속 / 미결

- **glossary 갱신** — `docs/guides/glossary.md`에서 Memory/History가 빠지고 아래 매핑이 들어가야 한다(별도 작업):

  | 제품 용어 | 코드 용어 |
  |---|---|
  | 진술(Statement) | `statements` |
  | 원본(Source) | `sources` |
  | 관계(Relation) | `statement_relations` |
  | 변경셋(Changeset) | `changesets` / `changes` |
  | 스페이스(Space) | `spaces` / `space_members` |

- **협업 전환 시 추가할 무결성·메커니즘** (지금은 자리만): 가입 훅 → 앱 레이어 이전, 관계 끝점 연쇄 archive 트리거, 관계 중복 방지 unique, Organization 층(`spaces.org_id`), 접근 축(공유·그룹)의 `is_space_member` 확장.
- **구현 단계로 열어둔 것**: `spaces.name` 채우는 정책, `locator` 형식, `changes.data` 형식(modify before/after), 진술 절단 기준, 노이즈 필터.
