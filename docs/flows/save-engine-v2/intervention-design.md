# 사람 개입 설계 — 진술 엔진 (save-engine-v2)

> 엔진 산출(진술·관계) 위에 사람이 개입하는 세 가지 백엔드 동작의 설계 — **빼기(archive)·되돌리기(revert)·pending 관계 해소**. 셋 다 changeset(변경 묶음) 조작 가족이라 한 집에서 짓는다.
>
> 토대: [`schema-design.md`](schema-design.md)(진술·원본·관계·변경셋 표 구조), [`relation-design.md`](relation-design.md)(pending 관계 changeset 단위·연쇄 archive 트리거 — 이미 빌드됨), [`ingestion-design.md`](ingestion-design.md)(넣기 — 되돌리기의 대상이 되는 변경셋이 여기서 생긴다). 07 모델링의 동작 규칙(append-only revert·status archived)을 메커니즘으로 번역한다.
>
> 범위 짝 문서: NEM-133(검토·되돌리기 **화면**)이 이 문서가 못박는 RPC/서비스 계약 위에 얇게 올라탄다. 이 문서는 **백엔드(조작·계약)만** 정한다.

---

## 0. 이 문서가 정하는 것 / 정하지 않는 것

- **정한다**: 세 동작의 메커니즘(어떤 변경셋을 남기고 무엇을 archive/restore하나), 조작 RPC와 tRPC 계약(시그니처·권한·가드), 읽기 계약(검토함·이력 목록), 겹쳐 쌓이는 동작의 정확성 규칙(실제 일으킨 전이만 기록), 마이그레이션, 테스트 범위.
- **정하지 않는다**: 검토·되돌리기 **화면**(NEM-133), 충돌 해소의 "승자 고르기 → replaces" 흐름(relation-design §11이 검토함 설계로 넘김), 진술 직접 작성·수정 기능(별도 기능), 거절 후 되살리기 경로(작은 후속), 진술 modify 시 stale 관계 재평가(`recheck` — 07 기존 보류).

---

## 1. 전체 그림 — 세 동작이 한 집

엔진은 글을 진술로 쪼개고(넣기) 진술 사이를 잇는다(관계). 그 산출이 틀리거나 애매할 때 사람이 개입하는 세 동작:

```
빼기 (archive)        — 잘못 들어간 진술·원본 1개를 가린다           → manual 변경셋
되돌리기 (revert)     — 한 변경 동작(글 넣기, 자동 잇기 묶음)을 무른다  → revert 변경셋
pending 관계 해소     — 엔진이 미뤄둔 관계 제안을 적용/거절한다         → 상태 전이(+관계 행)
```

셋 다 **append-only·무손실** 위에서 돈다 — 어떤 사람 동작도 원장을 물리적으로 지우지 않는다. 빼기는 `status=archived`, 되돌리기는 역변경셋 덧쌓기, 거절은 제안을 terminal 상태(`rejected`)로 보낼 뿐 행을 지우지 않는다.

세 동작 모두 **사용자 경로**다 — `authenticated` + 멤버십 검증(`is_space_member`), `SECURITY DEFINER`. 넣기의 `retry_*` RPC와 같은 패턴이며, 직접 쓰기는 RLS(SELECT-only)로 막혀 있으므로 전부 RPC 경유다. 엔진 워커 RPC(`apply_relation_changesets` 등, service_role)와 권한 축이 다르다.

## 2. 척추 (재논쟁 금지)

이미 박힌 결정(07·schema·relation-design) 위에 선다:

- **되돌리기는 append-only.** 물리 삭제·덮어쓰기 없음. revert 변경셋을 덧쌓고 "되돌려졌나"는 그 존재로 파생.
- **빼기 = `status=archived`.** 원장엔 남는 무손실. 유효성은 "존재 + 미대체"로 파생되므로 archive면 자연히 유효 집합에서 빠진다.
- **진술·원본 불변.** 내용 수정 안 함 — 수정이 필요하면 archive + 재생성.
- **변경셋 단위**(relation-design §6 확정): 엔진 자동 적용 관계 = **글당 1개**. pending 관계 = **건당 1개**. 그대로 받는다.
- **authorId**: 사람 산물(빼기·되돌리기 변경셋)엔 author. 엔진 산물(진술·관계, pending 제안)엔 없음.

이 문서가 새로 확정한 것(Q1~Q4):

| Q | 결정 |
|---|---|
| **Q1 원본 빼기 연쇄** | **연쇄 없음**(07 유지). 원본 archive는 진술을 건드리지 않는다. "글 통째로 무르기"는 ingestion 되돌리기(§4.1)가 담당 — v1 헤드라인 원본 동작. "원본만 archive"는 계약에 자리만(§3.2). |
| **Q2 되돌리기 범위** | **변경셋 단위 polymorphic**(§4). 되돌리기 변경셋은 *실제 일으킨 전이만* 기록하고, 관계는 열거하지 않는다 — 끝점 연쇄 트리거가 불변식의 주인. |
| **Q3 빼기 vs 되돌리기** | **둘 다 유지**. 빼기=객체 1개 archive(사물). 되돌리기=변경셋 무르기(사건). 다른 단위·표면. |
| **Q4 pending 해소** | 적용(행 생성+applied) / 거절(`rejected` 신설, 영구) / 충돌은 적용·거절까지만, "승자 고르기→replaces"는 후속(§5.3). |

## 3. 빼기 (archive)

존재하는 객체 하나를 가리는 사람의 직접 편집. `manual` 변경셋 1개에 `archive` 변경 하나를 담는다.

### 3.1 진술 빼기 — 헤드라인 동작

"이 진술이 틀렸다/노이즈다, 이것만 뺀다." 글당 진술 N개 중 하나만 뺄 수 있어야 하므로 되돌리기(변경셋=글 전체)로는 못 푸는 자리다(Q3).

`archive_statement(p_statement_id)`:

1. 진술이 **현재 active일 때만** 진행(이미 archived면 `RAISE` — 새 변경셋을 만들지 않는다, §4.3의 "실제 전이만 기록").
2. `manual` 변경셋 1개(`author_id = auth.uid()`) + `changes`: `{action:'archive', target_type:'statement', target_id}`.
3. 진술 `status='archived'` + **`ingestion_status='pending'`** — schema §5.3의 선언적 동기화. 워커가 archived 진술을 집어 Qdrant에서 벡터를 지운다.
4. `pgmq.send('statement_sync', notify)` — 벡터 축출을 워커가 깨어 처리.

**관계는 건드리지 않는다** — 끝점 진술이 archived되면 `trg_statements_cascade_archive_relations`(이미 빌드됨)가 걸린 active 관계를 자동 archive한다. RPC는 진술만 archive하고, 관계 연쇄는 트리거가 소유한다.

### 3.2 원본 빼기 — 자리만

Q1: 원본 archive는 진술을 **건드리지 않는다**(07). 사용자가 원본 수준에서 원하는 헤드라인 동작은 "글 통째로 무르기"(= ingestion 되돌리기, §4.1)이고, "원문만 가리고 진술은 남기기"는 v1에 강한 시나리오가 없다(기밀 원문은 soft-archive로 보호 안 되는 hard-delete 케이스라 07이 별도로 미룸).

`archive_source(p_source_id)`는 계약에 **자리로 둔다** — `manual` 변경셋 + `{archive, source, id}`, 원본 `status='archived'`. 벡터 없음(원본은 임베딩 안 함), 연쇄 없음. NEM-133이 필요로 하면 얹는 얇은 형제 RPC. v1 화면 헤드라인 아님.

## 4. 되돌리기 (revert)

한 변경 *동작*을 무른다. 대상은 변경셋(`reverts_id`)이고, `revert` 변경셋을 덧쌓는다(`author_id = auth.uid()`). **타겟 변경셋 타입별로 하는 일이 다른 polymorphic RPC**다.

`revert_changeset(p_changeset_id)` — 공통 골격:
- 타겟이 **현재 in-effect일 때만** 진행(이미 되돌려졌으면 `RAISE`, §4.4).
- 타겟의 `changes`를 읽어 **역연산**을 적용하고, 역연산을 `revert` 변경셋의 `changes`로 **그대로 기록**한다(자기 기술적 — redo가 이 기록만 보고 다시 뒤집는다).
- 역연산표: `create → archive`, `archive → restore`, `restore → archive`. (`modify`는 v1 미생성 — §10.)

> **`restore` 액션 신설.** `change_action` enum에 `restore`(archived→active 복귀)를 더한다. 이유: 되돌리기/redo가 자기 기술적이려면 "가린 것"의 역(되살림)을 changes로 남겨야 하는데, 기존 `create/archive/modify`엔 그 자리가 없다. `archive`의 대칭으로 `restore`를 두면 revert가 타입별 역연산표 하나로 닫힌다(데이터 없음 — `archive`와 같은 무결성). 이력도 "되돌리기: S2 되살림"으로 읽힌다.

### 4.1 ingestion 되돌리기 — "글 통째로 무르기"

타겟 = `ingestion` 변경셋. "이 글 잘못 넣었다, 다 무르자."

- 그 변경셋이 만든 진술(`changes` 중 `create/statement`) 가운데 **현재 active인 것만** archive + `ingestion_status='pending'`(벡터 축출).
- 변경셋의 `source_id`가 가리키는 **원본도 함께** archive — "글 통째로"의 *글*은 원본이므로, 되돌리면 원본도 활성 목록에서 빠진다. (원본은 changes엔 없지만 변경셋의 명백한 주어라 `source_id`로 닿는다. Q1의 "원본 빼기 → 진술 유지"와 축이 다르다 — 저쪽은 원본만 빼는 독립 동작, 이쪽은 글 넣기라는 *사건*을 통째로 무르는 것.)
- `revert` 변경셋의 changes = `{archive, source, source_id}` + `{archive, statement, id}×(active N)`.
- **관계는 열거 안 함** — 진술이 archived되며 트리거가 걸린 관계(그 글의 자동 잇기 100% + 다른 글이 이 진술을 가리킨 cross-source 관계까지)를 자동 archive(Q2). 잇기 후보는 새 진술의 벡터로 space 전체를 검색하므로 끝점이 여러 원본에 걸치지만, 모든 잇기 관계는 끝점 하나가 이 글의 진술이라 진술 archive만으로 빠짐없이 정리된다.
- notify(벡터 축출).

그 글이 촉발한 `relation` 변경셋(같은 `source_id`)은 건드리지 않는다 — 그 관계 행들은 이미 위 트리거로 archived고, 변경셋 status는 그대로 `applied`로 남는다(다른 변경셋의 status는 안 바꾼다, append-only). "자동 잇기만 따로 무르기"는 §4.2.

### 4.2 relation 되돌리기 — 자동 잇기만 무르기

타겟 = `relation` 변경셋(applied). "진술은 두되 엔진이 단 관계가 마음에 안 든다"(relation-design §6).

- 그 변경셋이 만든 관계 행(`changes` 중 `create/relation`) 가운데 **현재 active인 것만** archive.
- `revert` 변경셋 changes = `{archive, relation, id}×(active M)`.
- 진술·원본·벡터 무관. 끝점 진술은 그대로 active.

### 4.3 manual 되돌리기 — 빼기 무르기

타겟 = `manual` 변경셋(진술/원본 빼기). "방금 뺀 거 되살린다."

- 그 변경셋이 archive한 대상을 **restore**(active 복귀). 진술이면 `ingestion_status='pending'`(벡터 재적재) + notify. 원본이면 status만.
- `revert` 변경셋 changes = `{restore, statement|source, id}`.
- 진술 restore 시 트리거가 **양끝이 다 active인** 관계만 복원(한쪽이 아직 가려져 있으면 관계도 가린 채). 이미 빌드된 트리거의 복귀 분기 그대로.

### 4.4 redo, 그리고 겹쳐 쌓기

**redo = 되돌리기의 되돌리기** = `revert` 변경셋을 타겟으로 `revert_changeset`을 다시 부른다(원래 타겟이 아니라). revert의 changes(예: archive)를 역(restore)으로 적용한다. 같은 RPC가 처리한다.

**겹쳐 쌓여도 안 밟는 규칙(Q3의 이빨):**

> 모든 변경셋(빼기·되돌리기)은 **그 시점에 실제로 일으킨 전이만** 기록한다. revert는 *그 시점 active인* 대상만 archive하고 그것만 changes에 적는다. redo는 *그 revert가 적은 것만* 되살린다.

예: 글 넣기 → S1·S2·S3 / 사용자가 S2만 빼기(manual) / 그 글 되돌리기. 되돌리기는 그 시점 active인 S1·S3만 archive·기록하고(S2는 건너뜀), redo는 S1·S3만 복귀 — **손수 뺀 S2는 가린 채로 보존**된다. manual·revert·redo가 여러 겹 쌓여도 각 결정이 독립적으로 살아남는다(append-only 정확성 조건).

**double-revert 가드:** 한 변경셋엔 *유효한* revert가 최대 하나. `revert_changeset(C)`는 C를 가리키는 유효 revert가 이미 있으면 `RAISE`(이중 archive 방지 — 더블클릭 멱등). "유효함"은 revert 사슬의 패리티로 파생(C를 가리키는 revert가 다시 되돌려졌으면 C는 다시 in-effect). 정확한 판정 SQL은 빌드 세부(재귀 조회), 계약은 "되돌리기는 멱등하다"를 보장한다.

## 5. pending 관계 해소

엔진이 애매·충돌이라 미뤄둔 관계 제안. pending 동안 **관계 행은 없고**, 제안은 `relation`·`pending` 변경셋의 `changes.data`(예약된 `target_id` + `{type, from_id, to_id}`)에만 산다(relation-design §6).

### 5.1 적용 — pending→applied, 행 생성

`apply_pending_relation(p_changeset_id)`:

- 변경셋이 `type='relation'` AND `status='pending'`일 때만(아니면 `RAISE`).
- 그 변경셋의 단일 change에서 `data`(예약 `target_id`·type·from·to)를 읽어 `statement_relations` 행 생성 — **예약된 `target_id`를 id로** 써서 changes.target_id가 그대로 유효하게. `ON CONFLICT (from_id,to_id,type) DO NOTHING`(다른 경로로 이미 있으면).
- 변경셋 `status='applied'`. 이제 일반 applied 관계와 동일 — 꺼내기에 비치고(충돌이면 ⚡), `relation` 변경셋(건당 1개)을 타겟으로 §4.2 되돌리기 가능.
- 끝점 무결성: 제안 대기 중 끝점이 archived됐으면(stale 제안) active 관계를 가린 진술에 걸 수 없다 — 양끝 active일 때만 적용, 아니면 stale로 보고 거절 처리(빌드 세부). 트리거가 끝점 불변식을 지키는 것과 같은 결.
- author: `relation` 변경셋은 shape상 `author_id IS NULL`(엔진 제안이라). 적용은 status 전이일 뿐 author를 찍지 않는다 — 누가 적용했나는 v1(1인 space)에서 유일 멤버라 자명하고, 필요해지면 협업 단계에서 더한다.

### 5.2 거절 — pending→rejected, 영구

`reject_pending_relation(p_changeset_id)`:

- `type='relation'` AND `status='pending'`일 때만.
- 변경셋 `status='rejected'`. 관계 행은 안 만든다. `changeset_status` enum에 `rejected` 신설.

`pending`은 "아직 원장에 안 들어간 잠정 제안"이라 terminal 전이(applied/rejected)는 append-only 위반이 아니다(append-only는 *적용된* 것을 무를 때의 규칙). 거절된 제안 행이 "엔진 제안 → 사람 거절" 흔적으로 남는다.

**거절의 값 = 다시 안 올라옴.** §6의 재제안 가드가 거절한 쌍을 다시 검토함에 올리지 않는다. 사용자 체감은 "한 번 아니라고 하면 계속 아니다." 거절 빈도 자체를 줄이는 건(애매를 적게 올리기) 관계 엔진 게이트·후보 튜닝의 몫이라 이 작업 밖(relation-design §11).

### 5.3 충돌 해소 — 적용·거절까지만

충돌 제안 앞에서 사람이 할 수 있는 셋 중:
1. **적용** — "맞아, 충돌" → `conflicts` 관계 생성(⚡). §5.1 그대로.
2. **거절** — "충돌 아냐" → §5.2 그대로.
3. **승자 고르기** — "이쪽이 맞고 저쪽은 지난 것" → `conflicts` 대신 `replaces`로 마무리.

**1·2는 이 작업이 푼다. 3번(승자 고르기)은 후속**이다 — 충돌은 대칭인데 replaces는 방향이라 승자 선택 UI가 필요하고, `conflict` 변경셋 type의 거취 결정과 꺼내기 표식 전환(⚡→지난 것)을 동반한다. relation-design §11이 이를 "충돌 해소 흐름 + conflict type 거취 = 검토함 설계"로 명시적으로 별도 주인에게 넘겼고, 실제 충돌 데이터를 봐야 잘 설계된다. 1·2로 충돌도 안 막히므로 막다른 길이 아니다.

## 6. 재제안 가드 — 거절·기존 쌍 안 올림

워커의 `apply_relation_changesets`(이미 빌드됨)의 pending 중복 가드에 `rejected`를 더한다. 현재는 같은 `(from,to,type)`의 **pending** 제안이 있으면 건너뛴다 — 여기에 **rejected**도 포함해, 사람이 거절한 쌍을 엔진이 다시 제안하지 않게 한다.

- 이미 active인 관계의 재제안은 후보 좁히기(relation-design §4 "이미 같은 종류 관계 걸린 쌍은 건너뜀")가 LLM 전에 막으므로 여기선 pending·rejected만 본다.
- 같은 쌍이라도 **type이 다르면** 다른 주장이라 막지 않는다(가드는 `(from,to,type)` 단위) — "supports 거절"이 "conflicts 제안"을 막지 않는다.

## 7. 계약 (NEM-133이 올라탄다)

### 7.1 조작 RPC (사용자 경로 — `authenticated` + 멤버십 검증, SECURITY DEFINER)

| RPC | 시그니처 | 하는 일 |
|---|---|---|
| `archive_statement` | `(p_statement_id uuid) → void` | 진술 빼기(§3.1). manual 변경셋 + archive + 벡터 축출 + notify |
| `archive_source` | `(p_source_id uuid) → void` | 원본 빼기(§3.2, 자리). manual 변경셋 + archive |
| `revert_changeset` | `(p_changeset_id uuid) → uuid` | 되돌리기/redo(§4). revert 변경셋 id 반환 |
| `apply_pending_relation` | `(p_changeset_id uuid) → uuid` | pending 적용(§5.1). 생성된 관계 id 반환 |
| `reject_pending_relation`| `(p_changeset_id uuid) → void` | pending 거절(§5.2) |

권한: `REVOKE ALL FROM public, anon` + `GRANT EXECUTE TO authenticated, service_role`(운영자 경로 겸). 멤버십 검증은 `retry_source_*` RPC 패턴 그대로 — `auth.uid()`가 NULL이면 운영자(통과), 아니면 `is_space_member` 검증.

### 7.2 읽기 계약 (검토함·이력 화면용)

조작만으론 "무엇을 적용/되돌릴지" 고를 목록이 없다. 조작과 한 벌로 짠다. RLS(Space SELECT)가 격리하므로 일반 조회(서비스 레이어, RPC 아님)로 충분.

- **검토함** — pending 관계 제안 목록: `type='relation' AND status='pending'`인 변경셋 + 각 change의 `data`(type·from·to) + 양끝 진술 `content`를 조인해 카드로. 충돌 여부는 `data.type='conflicts'`로 파생.
- **이력** — 변경셋 목록: 내 Space의 변경셋(ingestion/relation/manual/revert)을 시간순 + 효과 요약(진술 N·관계 M) + **되돌림 여부**(이 변경셋을 가리키는 유효 revert 존재로 파생). 되돌리기 UI가 여기서 타겟을 고른다.

### 7.3 tRPC

`routers/`는 thin(검증 + 서비스 호출), 로직은 `services/`. 입력 Zod는 `@nema-io/shared`. 새 라우터 `changeset`(또는 기존 라우터 확장):

- mutation: `archiveStatement` / `revertChangeset` / `applyPendingRelation` / `rejectPendingRelation` (+ 자리: `archiveSource`)
- query: `listPendingRelations`(검토함) / `listChangesets`(이력)

모두 `protectedProcedure`. shared 스키마: id는 `z.string().uuid()`.

## 8. 마이그레이션

supabase 규칙: 변경당 1파일, `supabase migration new`. enum `ADD VALUE`는 같은 트랜잭션에서 못 쓰므로(Postgres) 사용 RPC와 분리.

1. **enum 추가** — `changeset_status`에 `rejected`, `change_action`에 `restore`(별도 파일, RPC 분리).
2. **`chk_data_by_action` 수정** — `restore`도 `archive`처럼 data 없음: `(action IN ('create','modify') AND data IS NOT NULL) OR (action IN ('archive','restore') AND data IS NULL)`.
3. **조작 RPC** — §7.1 다섯 + 권한.
4. **재제안 가드 수정** — `apply_relation_changesets`의 pending 가드에 `rejected` 포함(§6). `CREATE OR REPLACE`.

작성 후 `supabase db reset && supabase gen types ... > apps/server/src/infra/database.types.ts`, 생성 타입 동반 커밋.

## 9. 테스트 범위

실 사용자 시나리오·사전검증 필요한 엣지만(런타임·커버리지용 금지):

- **연쇄 archive**: 진술 빼기 → 걸린 관계 자동 archive(트리거). 글 되돌리기 → 그 글의 진술·관계 + cross-source 관계까지 빠짐.
- **revert 멱등·겹침**: double-revert 가드, S2만 빼고 글 되돌리기 → redo 시 S2 보존(§4.4), redo 대칭(archive↔restore).
- **벡터 동기화**: archive/restore가 `ingestion_status='pending'` + notify를 찍어 워커가 벡터 삭제/재적재.
- **pending 해소 후 상태**: 적용 → 행 생성·꺼내기 비침, 거절 → rejected·재제안 안 됨, stale 제안(끝점 archived) 처리.

## 10. 보류 / 후속 — 해제 조건과 함께

- **충돌 "승자 고르기 → replaces"** + `conflict` 변경셋 type 거취 — 검토함 설계(relation-design §11). 실제 충돌 데이터 관측 후.
- **거절 후 되살리기** — 마음 바뀐 거절을 되돌리는 경로. 작은 후속, 요구되면.
- **진술 직접 작성·수정** — 진술 불변·author 규칙과 부딪혀 별도 설계. 실제 UX 필요 입증 시.
- **원본 수정 설탕** — revert-ingestion + create-source 조립. 원본 수정 마찰이 dogfooding에서 입증되면.
- **진술 modify 시 stale 관계 재평가(`recheck`)** — 07 기존 보류. 진술 modify가 실제로 생기는 날.
- **resolver author 기록** — pending 적용/거절의 주체. 협업(멀티 멤버) 단계에서.
