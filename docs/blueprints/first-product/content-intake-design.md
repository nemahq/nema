# 맥락 넣기(context-in): 구현 청사진

> 첫 사용자가 맥락을 넣는 첫 입구. 두 입구(앱 내 작성 / 외부 LLM이 MCP로 올리기)가 같은 초안 대기 자리를 공유하고, 사람이 확정하면 기존 추출·관계 엔진이 자동으로 진술을 쪼개 엮는다. 짝이 되는 맥락 내보내기(context-out)는 별도 슬라이스.

대상 슬라이스: NEM-157 (에픽 NEM-133, 문서 `docs/foundations/11-first-product-direction.md` §3·§5·§10 기준).

이 문서는 구현 청사진이다. 코드는 짜지 않고 설계만 못박는다. 두 입구가 충돌 없이 병렬로 붙도록 공유 계약을 먼저 고정한다.

---

## 1. 무엇을 짓나

채울 빈칸은 엔진이 아니다. 확정 뒤 파이프(추출 → 임베딩 → 잇기 → 충돌 게이트)는 이미 자동으로 끝까지 돈다. 이번 슬라이스가 새로 짓는 것은 세 곳이다.

1. 초안(draft)을 1급 엔티티로 세운다. 두 입구가 같은 자리에 쓰고, 사람이 확정하는 대기 공간.
2. 확정 게이트를 잇는다. 초안을 기존 `create_source` 엔진 트리거에 연결한다(현재 v1 저장 파이프 철거로 비어 있음).
3. 가벼운 주제 표식을 단다. 공간에 쌓이는 재사용 가능한 주제 레지스트리.

엔진(추출 워커, 관계 판정, `create_source`, `apply_ingestion_changeset`)은 한 줄도 깎지 않는다. 전부 순수 추가다.

---

## 2. 합의된 설계 결정 (요약)

**초안**
- 1급 엔티티. 여러 개 공존하고 id로 다룬다. 사람과 MCP가 공동 편집한다(노션에 MCP 단 모델).
- 동시 수정 누락 위험(LLM 수정 → 사람 수정 → LLM 재수정)은 수용한다. 이상적 UX는 다음 슬라이스.
- 확정하면 초안은 사라지고 내용은 원본(기억)으로 승격한다. 폐기(버리기) 허용.

**작성 어시스턴트 (한 방 제안만)**
- 거친 말뭉치를 한 방에 깎아 본문 + 제목 + 주제를 제안하는 것까지가 이번 슬라이스.
- 주고받기 대화("더 짧게" 식 반복 편집)는 다음 슬라이스.

**확정 게이트 (사람 주권)**
- 올라온 글은 초안으로 대기한다(아직 추출 안 함). 사람이 확정해야 진술로 쪼개진다.
- 확정은 사람만 한다. MCP는 절대 확정하지 않는다.

**제목·주제**
- 둘 다 작성한 쪽이 제안한다(외부=MCP, 앱=nema 어시스턴트). 사람이 게이트에서 확정·교정한다.
- 주제는 원본(source)에 0..N개 붙는다(멀티 라벨, 무태그 허용). 진술의 주제는 진술 → 원본 → 주제 조회로 따라온다.
- 주제는 공간(Space)에 쌓이는 재사용 목록(레지스트리)이다. 평평한 단일 라벨이고 계층·군집·진술별 표식은 없다.
- 주제 레지스트리 = 지도의 줄기 목록. 같은 주제를 가진 원본들의 집합이 곧 한 줄기다(별도 줄기 엔티티 없음).

**MCP**
- 이번 세션은 계약만 고정한다(초안 올리기 쓰기 + 주제목록 읽기의 경계).
- MCP 서버 구현(패키지·통신·인증·도구 내부)은 다음 세션.

---

## 3. 엔진 현실 (코드로 검증됨)

이미 서 있는 것(건드리지 않음):

- `create_source(p_space_id, p_body, p_session_id)` RPC: source를 `extraction_status='pending'`으로 박제하고 `pgmq.send('statement_sync')`로 워커를 깨운다. (`supabase/migrations/20260611120858_ingestion_pipe_rpcs.sql:18`)
- 추출 워커: `fetch_pending_sources` → 추출 → `apply_ingestion_changeset`(진술 + `statement_sources.locator` + ingestion changeset) → 임베딩 → 잇기(관계 판정, 게이트: 확신·비충돌만 자동 applied, 충돌·애매는 pending changeset으로 사람에게)까지 한 사이클에 돈다. (`apps/server/src/infra/statement-sync/worker.ts`)
- `createSource` 서비스가 이미 개인 Space를 해소한다(가장 오래된 space_member). (`apps/server/src/services/source-service.ts:19`)
- 변경셋·되돌리기·충돌 pending 조회. (`apps/server/src/services/changeset-service.ts`)

비어 있는 것(이번에 채움):

- 초안 → `create_source` 확정 배선. v1 저장 버튼·파이프는 철거됨(`apps/web/src/features/session/components/DraftTabContent.tsx:38`).
- 주제 표식: `statements`·`sources` 어디에도 topic 컬럼 없음. stem/topic/group 엔티티 테이블 없음.
- 여러 초안의 집: 지금 `sessions.draft = {body}`는 세션당 한 칸이라 "여러 초안 공존"과 안 맞음. v2에서 대체한다(아래 9장).
- MCP 서버: 통째로 없음.

제약 확인: `sessions`는 `user_id` 소유(space_id 없음). `sources`만 `session_id`(nullable)로 세션을 참조한다. `sources.status`는 `active|archived`, `extraction_status`는 `pending|completed|failed`이고 워커는 pending만 집는다.

---

## 4. 데이터 모델 (스키마 변경)

신규 테이블 셋과 컬럼 하나, 그리고 초안 RPC 넷. 엔진 테이블(statements/relations/changesets/sources의 기존 컬럼)은 불변.

### 4.1 주제 레지스트리

```sql
-- migration: topics_registry

-- 공간에 쌓이는 재사용 주제 목록 = 지도의 줄기 목록.
-- 평평한 단일 라벨(계층/군집 없음). UNIQUE(space_id, name)로 중복 라벨 차단.
CREATE TABLE topics (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id   uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (space_id, name)
);

-- 원본 0..N 주제 (멀티 라벨, 무태그 허용). 진술의 주제는 statement_sources -> source_topics로 파생.
CREATE TABLE source_topics (
  source_id  uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  topic_id   uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_id, topic_id)
);

-- 원본 제목 (확정 시 초안 제목이 넘어옴). 추출 워커는 안 읽음 = 엔진 무영향.
ALTER TABLE sources ADD COLUMN title text;

CREATE TRIGGER set_topics_updated_at BEFORE UPDATE ON topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_topics ENABLE ROW LEVEL SECURITY;

-- 읽기는 내 공간만. 쓰기는 RPC(SECURITY DEFINER) 경유.
CREATE POLICY topics_select ON topics FOR SELECT
  USING (is_space_member(space_id));
CREATE POLICY source_topics_select ON source_topics FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM sources s
    WHERE s.id = source_id AND is_space_member(s.space_id)
  ));
```

설계 근거: 진술별 주제 표식은 추출 워커에 "진술별 주제 분류"라는 새 능력을 심어야 하므로 버린다. 원본 단위 멀티 라벨이면 확정 게이트 한 곳에서 사람이 정하고, 진술은 join으로 따라오며, 엔진은 주제를 몰라도 된다. merge로 한 진술이 여러 원본에 걸려도 "원본들의 주제 합집합"으로 자연스럽게 풀린다.

### 4.2 초안

```sql
-- migration: drafts

CREATE TYPE draft_origin AS ENUM ('in_app', 'external');

-- 확정 직전 대기 자리. 1급 엔티티(여러 개, id로 다룸), 사람+MCP 공동 편집.
-- 상태 컬럼 없음: 행이 존재 = 대기중. 확정/폐기 = 행 삭제(확정 시 source로 승격).
CREATE TABLE drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id        uuid NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  author_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  origin          draft_origin NOT NULL,
  title           text,
  body            text NOT NULL DEFAULT '',
  -- 제안된 주제(이름 문자열). 확정 시 레지스트리로 resolve. 미확정 동안은 자유 이름.
  proposed_topics text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_drafts_space ON drafts (space_id, created_at DESC);

CREATE TRIGGER set_drafts_updated_at BEFORE UPDATE ON drafts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY drafts_select ON drafts FOR SELECT
  USING (is_space_member(space_id));
-- 쓰기는 RPC 경유 (create/update/delete/confirm).
```

`proposed_topics`를 레지스트리 id가 아니라 이름 배열로 두는 이유: 미확정 초안의 주제는 아직 레지스트리에 없을 수 있는 후보다. 레지스트리 행 생성은 확정 시점에만 일어난다(확정되지 않은 주제로 목록을 오염시키지 않는다).

### 4.3 초안 RPC

확정은 기존 `create_source`를 그대로 호출해 엔진 트리거를 재사용한다. confirm_draft는 그 위에 제목·주제 연결·초안 제거를 한 트랜잭션으로 얹는다.

```sql
-- migration: draft_rpcs

-- 생성 (앱 어시스턴트 결과 / MCP 올리기 공용)
CREATE OR REPLACE FUNCTION create_draft(
  p_space_id        uuid,
  p_origin          draft_origin,
  p_body            text,
  p_title           text   DEFAULT NULL,
  p_proposed_topics text[] DEFAULT '{}'
)
RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT is_space_member(p_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', p_space_id;
  END IF;
  INSERT INTO drafts (space_id, author_id, origin, title, body, proposed_topics)
  VALUES (p_space_id, auth.uid(), p_origin, p_title,
          coalesce(p_body, ''), coalesce(p_proposed_topics, '{}'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 공동 편집 (사람 수정 / MCP가 기존 초안 지목 채우기). 부분 갱신(NULL은 유지).
CREATE OR REPLACE FUNCTION update_draft(
  p_draft_id        uuid,
  p_title           text   DEFAULT NULL,
  p_body            text   DEFAULT NULL,
  p_proposed_topics text[] DEFAULT NULL
)
RETURNS void AS $$
DECLARE v_space_id uuid;
BEGIN
  SELECT space_id INTO v_space_id FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft % not found', p_draft_id; END IF;
  IF NOT is_space_member(v_space_id) THEN
    RAISE EXCEPTION 'caller cannot access draft %', p_draft_id;
  END IF;
  UPDATE drafts SET
    title           = coalesce(p_title, title),
    body            = coalesce(p_body, body),
    proposed_topics = coalesce(p_proposed_topics, proposed_topics)
  WHERE id = p_draft_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 폐기 (멱등)
CREATE OR REPLACE FUNCTION delete_draft(p_draft_id uuid)
RETURNS void AS $$
DECLARE v_space_id uuid;
BEGIN
  SELECT space_id INTO v_space_id FROM drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT is_space_member(v_space_id) THEN
    RAISE EXCEPTION 'caller cannot access draft %', p_draft_id;
  END IF;
  DELETE FROM drafts WHERE id = p_draft_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 확정 게이트: 엔진 트리거(create_source) 재사용 + 제목/주제 연결 + 초안 제거를 한 트랜잭션으로.
CREATE OR REPLACE FUNCTION confirm_draft(
  p_draft_id uuid,
  p_title    text,
  p_topics   text[]
)
RETURNS uuid AS $$
DECLARE
  v_space_id  uuid;
  v_body      text;
  v_source_id uuid;
  v_topic     text;
  v_topic_id  uuid;
BEGIN
  SELECT space_id, body INTO v_space_id, v_body
  FROM drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draft % not found', p_draft_id; END IF;
  IF NOT is_space_member(v_space_id) THEN
    RAISE EXCEPTION 'caller is not a member of space %', v_space_id;
  END IF;
  IF v_body IS NULL OR btrim(v_body) = '' THEN
    RAISE EXCEPTION 'draft body must be non-empty to confirm';
  END IF;

  -- 엔진 트리거 재사용: source 박제 + 워커 notify (create_source가 둘 다 함).
  -- 원본 작성자(sources.author_id) = 확정자(auth.uid()) = 사람 주권. drafts.author_id는
  -- 출처 보존용이며 이 슬라이스에선 안 읽는다(멀티 유저 때 외부 작성자 추적에 쓸 자리).
  v_source_id := create_source(v_space_id, v_body, NULL);

  UPDATE sources SET title = p_title WHERE id = v_source_id;

  -- 주제 레지스트리 find-or-create + 연결 (멀티 라벨). p_topics가 비면 루프 미실행 =
  -- 무태그 원본(미분류): 의도된 상태다(확정 시 주제 강제 안 함).
  FOREACH v_topic IN ARRAY coalesce(p_topics, '{}')
  LOOP
    CONTINUE WHEN btrim(v_topic) = '';
    -- DO UPDATE는 충돌 시 RETURNING을 켜는 관용구(기존 주제 재사용도 id 반환).
    -- 부수효과: 재사용 때마다 topics.updated_at 갱신 = "마지막 태깅" 시각(의도됨).
    INSERT INTO topics (space_id, name)
    VALUES (v_space_id, btrim(v_topic))
    ON CONFLICT (space_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_topic_id;
    INSERT INTO source_topics (source_id, topic_id)
    VALUES (v_source_id, v_topic_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- 초안은 역할 끝: 제거 (확정 뒤 사라짐)
  DELETE FROM drafts WHERE id = p_draft_id;

  RETURN v_source_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq;

-- 권한: 사용자 경로(RPC 안에서 멤버십 검증). MCP 서버도 사용자 토큰으로 authenticated.
-- 시그니처를 명시한다(기존 마이그레이션 하우스 스타일 + 오버로드 모호성 차단).
REVOKE ALL ON FUNCTION
  create_draft(uuid, draft_origin, text, text, text[]),
  update_draft(uuid, text, text, text[]),
  delete_draft(uuid),
  confirm_draft(uuid, text, text[])
  FROM public, anon;
GRANT EXECUTE ON FUNCTION
  create_draft(uuid, draft_origin, text, text, text[]),
  update_draft(uuid, text, text, text[]),
  delete_draft(uuid),
  confirm_draft(uuid, text, text[])
  TO authenticated, service_role;
```

핵심: `create_source`는 손대지 않는다. confirm_draft가 그것을 호출해 박제 + notify를 그대로 쓰고, 같은 트랜잭션에서 제목·주제만 덧붙인다. notify는 트랜잭션 커밋과 함께 보이므로 워커가 주제 연결 전에 먼저 집는 경합은 없다.

마이그레이션 후: `supabase db reset && supabase gen types ... > apps/server/src/infra/database.types.ts` (생성 타입 동반 커밋).

---

## 5. 공유 계약 (두 트랙이 의존하는 경계)

두 트랙(앱 UI, MCP)은 아래 타입·인터페이스에만 의존한다. 여기서 어긋나지 않으면 병렬로 간다.

### 5.1 공유 스키마 (`packages/shared`)

```ts
// packages/shared/src/schemas/topic.ts
export const TOPIC_NAME_MAX_LENGTH = 50;
export const DRAFT_TOPICS_MAX = 5; // 멀티 라벨 보수적 상한

export const TopicSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});
export type Topic = z.infer<typeof TopicSchema>;
```

```ts
// packages/shared/src/schemas/draft.ts
import { SOURCE_BODY_MAX_LENGTH } from "./source";

export const DraftOriginSchema = z.enum(["in_app", "external"]);
export const DRAFT_TITLE_MAX_LENGTH = 100;

export const DraftSchema = z.object({
  id: z.string().uuid(),
  origin: DraftOriginSchema,
  title: z.string().nullable(),
  body: z.string(),
  proposedTopics: z.array(z.string()).default([]),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Draft = z.infer<typeof DraftSchema>;

const TopicNameArray = z
  .array(z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH))
  .max(DRAFT_TOPICS_MAX);

// 앱 한 방 어시스턴트 입력 (거친 말뭉치)
export const DraftAssistInputSchema = z.object({
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
});

// 생성 (앱 어시스턴트 결과 + MCP 새 초안). draftId 없음 = 항상 신규.
// 기존 초안 갱신(MCP 기존 지목 / 사람 수정)은 draft.edit(부분)로 간다. 한 입력에
// create와 update를 겹치면 update 분기가 body를 강제해 부분 갱신이 막힌다.
export const DraftCreateInputSchema = z.object({
  origin: DraftOriginSchema,
  title: z.string().trim().max(DRAFT_TITLE_MAX_LENGTH).optional(),
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH),
  proposedTopics: TopicNameArray.default([]),
});

// 공동 편집 (사람 수정 + MCP 기존 초안 지목) - 부분 갱신(빠진 필드는 유지).
export const DraftEditInputSchema = z.object({
  draftId: z.string().uuid(),
  title: z.string().trim().max(DRAFT_TITLE_MAX_LENGTH).optional(),
  body: z.string().trim().min(1).max(SOURCE_BODY_MAX_LENGTH).optional(),
  proposedTopics: TopicNameArray.optional(),
});

// 확정 게이트. topics는 0개 허용 = 무태그(미분류). 강제하지 않는다.
export const DraftConfirmInputSchema = z.object({
  draftId: z.string().uuid(),
  title: z.string().trim().min(1).max(DRAFT_TITLE_MAX_LENGTH),
  topics: TopicNameArray, // .min 없음 → 0..N
});

export const DraftDeleteInputSchema = z.object({
  draftId: z.string().uuid(),
});
```

### 5.2 tRPC 계약 (`apps/server/src/router.ts`에 등록)

```
draft.assist(DraftAssistInput)  -> { draftId }     // providerProcedure (LLM). 한 방 제안 후 in_app 초안 생성
draft.create(DraftCreateInput)  -> { draftId }     // protectedProcedure. create_draft (신규만)
draft.edit(DraftEditInput)      -> void            // protectedProcedure. update_draft (부분; 사람 수정 + MCP 기존 지목)
draft.confirm(DraftConfirmInput)-> { sourceId }    // protectedProcedure. confirm_draft (게이트)
draft.delete(DraftDeleteInput)  -> void            // protectedProcedure. 폐기
draft.list()                    -> { drafts: Draft[] }   // 대기 초안 목록(인박스)
draft.get({ draftId })          -> Draft

topic.list()                    -> { topics: Topic[] }   // 레지스트리 읽기(재사용 제안용)
```

### 5.3 MCP 경계 (이번 세션은 계약만, 구현은 다음 세션)

MCP 서버는 사용자 토큰으로 인증해 위 tRPC와 같은 계약에 매핑되는 도구 둘을 노출한다.

- 읽기 도구 `list_topics` -> `topic.list` (기존 주제 재사용을 위해 먼저 읽는다)
- 쓰기 도구 `upload_draft` -> 새 초안은 `draft.create`(origin='external'), 기존 지목 채우기는 `draft.edit`(부분 갱신)

불변식: MCP는 `draft.confirm`을 절대 호출하지 않는다. 확정은 앱에서 사람만 한다(사람 주권 게이트). MCP 서버 자체(패키지 위치, 통신 방식, 인증 메커니즘, 도구 내부)는 다음 세션에서 이 계약에 맞춰 설계한다.

---

## 6. 데이터 흐름

### 6.1 앱 입구 (in_app)

```
사람이 거친 말뭉치 붙여넣기
  -> draft.assist (LLM 한 방: topic.list 읽어 기존 주제 재사용)
       -> { title, body, topics } 생성 -> create_draft(origin='in_app')
  -> 사람이 초안 검토/수정 (draft.edit, 필요 시)
  -> 사람이 확정 (draft.confirm: 제목/주제 최종 확정)
       -> confirm_draft -> create_source(박제 + 워커 notify)
                        -> sources.title 부착 + 주제 레지스트리 연결 + 초안 삭제
  -> [엔진 자동] 추출 -> 임베딩 -> 잇기 -> 충돌/애매는 pending changeset
```

### 6.2 외부 입구 (external, MCP)

```
외부 LLM(Claude Code)이 거친 대화를 한 방에 깎음
  -> list_topics (기존 주제 재사용) -> { title, body, topics }
  -> upload_draft (origin='external'; 새로 또는 기존 지목)
       -> create_draft / update_draft
  -> (나중에) 사람이 앱에서 대기 초안 발견 -> 검토/수정 -> 확정
       -> confirm_draft -> create_source -> [엔진 자동, 위와 동일]
```

두 입구의 차이는 "누가 한 방 제안을 하느냐"뿐이다(외부=MCP, 앱=nema). 확정 이후는 완전히 동일하고, 그 지점부터 엔진이 통째로 재사용된다. 외부 초안은 본문을 다시 깎지 않는다(이중 가공 방지). nema가 외부 본문에 하는 일은 없다.

### 6.3 주제가 진술에 닿는 길

진술은 자기 주제를 들지 않는다. `statement -> statement_sources -> sources -> source_topics -> topics`로 따라온다. 지도의 줄기 = `topics` 한 행, 그 줄기의 내용 = 그 주제를 가진 원본들과 그 원본의 진술들.

주제 없는 원본(무태그)은 어느 줄기에도 안 잡힌다. 지도는 이들을 "미분류" 묶음으로 따로 보여, 나중에 태깅(교정)할 인박스 역할을 한다. 무태그를 허용하는 값은 확신 없을 때 틀린 주제를 강요하지 않는 데 있다(원칙: 틀릴 만한 건 단정하지 않음 + 사람 주권).

---

## 7. 만들 / 고칠 파일

### 공유 뼈대 (Track 0)

| 파일 | 역할 |
| --- | --- |
| `supabase/migrations/<ts>_topics_registry.sql` | 신규: topics, source_topics, sources.title, RLS |
| `supabase/migrations/<ts>_drafts.sql` | 신규: draft_origin enum, drafts 테이블, RLS |
| `supabase/migrations/<ts>_draft_rpcs.sql` | 신규: create/update/delete/confirm_draft RPC |
| `apps/server/src/infra/database.types.ts` | 재생성(생성 타입 커밋) |
| `packages/shared/src/schemas/topic.ts` | 신규: Topic, 상수 |
| `packages/shared/src/schemas/draft.ts` | 신규: Draft, origin, create/edit/confirm/assist/delete 입력 |
| `packages/shared/src/index.ts` | 위 두 스키마 export |
| `docs/guides/glossary.md` | 갱신: draft(1급)·topic/주제·줄기(stem) 코드 용어 매핑, 기존 초안→Draft 항목 v2로 |
| `apps/server/src/services/draft-service.ts` | 신규: create/update/delete/confirm/list/get (Space 해소는 source-service 패턴 재사용) |
| `apps/server/src/services/topic-service.ts` | 신규: listTopics(레지스트리 읽기) |
| `apps/server/src/services/draft-assist.ts` | 신규: 한 방 어시스턴트(topic.list 읽기 + LLM + create_draft) |
| `apps/server/src/prompts/draft-assist.ts` | 신규: 시스템 프롬프트 + 구조화 출력 스키마({title, body, topics}) |
| `apps/server/src/routers/draft-router.ts` | 신규: assist/create/edit/confirm/delete/list/get |
| `apps/server/src/routers/topic-router.ts` | 신규: list |
| `apps/server/src/router.ts` | draft·topic 라우터 등록 |

### 앱 UI 트랙 (Track A)

| 파일 | 역할 |
| --- | --- |
| `apps/web/src/features/intake/` | 신규 feature: 말뭉치 입력 → 어시스턴트, 초안 인박스(대기 목록), 초안 에디터, 확정 게이트(제목 + 주제 칩, 레지스트리 재사용) |
| `apps/web/src/features/intake/hooks/` | 위 tRPC 엔드포인트 바인딩 |
| `apps/web/src/lib/tolgee/ko.json` | i18n 키 추가(UX writing 규칙 준수) |

### MCP 트랙 (Track B): 다음 세션

| 산출물 | 역할 |
| --- | --- |
| MCP 서버 패키지 | 도구 `list_topics`, `upload_draft`. 사용자 인증. 5.3 계약에 매핑 |

---

## 8. 빌드 순서 + 병렬 경계

```
[Track 0: 공유 뼈대]  (먼저, 단독)
  마이그레이션 3종 -> 타입 재생성 -> 공유 스키마(topic.ts/draft.ts)
  -> draft-service/topic-service/draft-assist + 라우터 등록
        |
        | (계약 고정: 5.1 스키마 + 5.2 tRPC)
        v
[Track A: 앱 UI]   ||   [Track B: MCP] (다음 세션)
  intake feature        list_topics / upload_draft 도구
  어시스턴트·인박스·게이트  (5.3 경계에만 의존)
```

병렬 경계: Track A와 B는 둘 다 5장 공유 계약(`DraftCreateInput`/`DraftEditInput`/`DraftConfirmInput`/`topic.list`/`draft.*`)에만 의존한다. 둘 다 `drafts` 테이블 + `confirm_draft`(앱) / `draft.create`·`draft.edit`(MCP)에서 수렴한다. Track 0이 이 계약을 박은 뒤에는 A·B가 서로를 안 봐도 된다.

---

## 9. v1 정리 (철거·대체 대상)

v2 자유 전제. 아래는 v1 초안 흐름이라 이번 슬라이스가 대체한다.

- `sessions.draft = {body}` 단일 칸 staging: 여러 초안 1급 모델(`drafts` 테이블)로 대체. `sessions` 테이블 자체는 해설(re-entry) 대화용으로 남되, draft 슬롯과 remember 모드 초안 편집 경로는 정리한다.
- `apps/server/src/services/chat/orchestrator.ts`의 draft 슬롯 경로(getDraft/setDraft/clearDraft), remember 모드 drafting, draft intent 분류·확인: 한 방 어시스턴트(`draft.assist`)로 대체. 정리 범위는 Track A에서 확정.
- `apps/web/.../DraftTabContent.tsx` 및 관련 chat lifecycle 초안 UI: intake feature로 대체.

정리는 새 경로가 선 뒤에 한다(엔진 경로 statement-sync/changeset은 불변).

---

## 10. §10 자기검산

1. 오랜만에 다시 켜는 순간을 돕는가: 주제 레지스트리 = 줄기 목록이라 지도가 줄기로 묶여 펼쳐진다. 한 방 어시스턴트가 넣기를 가볍게 해 평소에 줄기가 쌓인다. 예.
2. 신뢰를 올리는가(몰래 안 지우고 되돌릴 수 있나): 확정은 사람 게이트, 충돌·애매는 기존 pending changeset으로 사람에게, 되돌리기·archive 엔진 불변. 확정 시 원본 보존(초안만 사라지고 내용은 source로 승격). 예.
3. 넣는 일이 가벼운가(사람이 보고 고치기만): 외부는 본문 재가공 0, 앱은 한 방 어시스턴트가 깎고 사람은 게이트에서 제목·주제만 확정·교정. 예.
4. 큰 그림이 먼저인가: 주제는 평평한 단일 라벨, 군집·진술별 표식 없음, 멀티 라벨도 보수적 제안. 세부는 미룬다. 예.

---

## 11. 열린 항목 / 스코프 밖

열린 항목(만들며 정함):

- 제안 타이밍·방식의 세부(언제 어떤 UI로 제목·주제를 보여줄지). 두 입구 대칭은 정해짐(작성한 쪽이 한 방 제안 → 사람 게이트 확정).
- 초안 인박스 표면 위치(어디서 대기 초안을 보고 확정하나). Track A에서 결정.
- MCP 서버 구현 전반(패키지·통신·인증). 다음 세션.

스코프 밖(이번 슬라이스 아님):

- 똑똑한 주제 군집화, 진술별 주제, 진술의 다중 주제 분리. 멀티 라벨은 원본 단위 통째 등장까지만.
- 외부 초안 본문 추가 다듬기(이중 가공 방지). 사람의 직접 수정은 허용(공동 편집), 도우미 재가공만 막음.
- 초안 작성 주고받기 대화(반복 편집). 한 방 제안만 이번 슬라이스.
- 맥락 내보내기(context-out). 별도 슬라이스.
- 확정 후 원본 주제 사후 교정(source_topics 편집)은 후속. 이번엔 확정 게이트에서의 교정까지.

엣지(노트): merge로 한 진술이 여러 원본에 걸리면 주제가 여럿 보일 수 있다. 멀티 라벨 모델에서 의도된 동작(합집합)이라 손해가 아니다.
