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

`archive_source(p_source_id)` — `manual` 변경셋 + `{archive, source, id}`, 원본 `status='archived'`. 벡터 없음(원본은 임베딩 안 함), 연쇄 없음.

**빌드 결정 (G):** RPC는 **이번에 만든다**(자리만 두지 않는다) — `archive_statement`와 3줄 차이고, ingestion 되돌리기(§4.1)가 어차피 원본 archive 경로를 쓰므로 같은 로직을 공유한다. 단 **v1 화면 헤드라인은 아니다**(NEM-133이 노출할지는 화면 몫). 즉 "백엔드 계약은 완비, UI 노출은 선택".

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
- 변경셋의 `source_id`가 가리키는 **원본도 함께** archive — "글 통째로"의 *글*은 원본이므로, 되돌리면 원본도 활성 목록에서 빠진다(빈 원본 잔여 방지). Q1의 "원본 빼기 → 진술 유지"와 축이 다르다 — 저쪽은 원본만 빼는 독립 동작, 이쪽은 글 넣기라는 *사건*을 통째로 무르는 것.
  - **순수성 예외 (C, 명시):** revert는 원칙적으로 "타겟 변경셋의 `changes`를 뒤집는다". 그런데 원본은 ingestion 변경셋의 `changes`에 없고(넣기는 진술 create만 기록, 원본은 동기 박제) `source_id`로만 닿는다. 그래서 **ingestion 되돌리기만은** changes 밖의 `source_id`에서 원본을 *유도*해 archive한다 — 유일한 예외다. 단 그 archive는 revert 변경셋의 changes에 `{archive, source, source_id}`로 *기록*되므로, redo는 다시 자기 기술적이다(예외는 "무엇을 archive할지 아는 경로"에만 있고, 기록·redo는 일반 규칙 그대로).
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

**double-revert 가드 — in-effect 술어 (B).** 멱등성과 이력의 "되돌림 여부"(§7.2)가 둘 다 이 술어에 기대므로 "빌드 세부"로 미루지 않고 여기서 정의한다.

> 변경셋 X가 **in-effect**(효력 있음) ⟺ X를 가리키는(`reverts_id = X`) revert 중 *그 자신이 in-effect인 것*이 하나도 없다.

재귀 정의다 — redo가 revert를 또 가리키고(분기 가능: redo 후 C를 다시 revert하면 C에 revert 자식이 둘), 자식의 효력이 손자에 의해 뒤집힌다. 구현은 재귀 CTE(또는 `reverts_id` 사슬을 따라 올라가며 효력 토글):

```
-- C가 현재 되돌려졌나 = C를 가리키는 in-effect revert가 존재하나
WITH RECURSIVE eff(id, in_effect) AS (...)  -- 잎(자식 없는 revert)=in-effect, 위로 토글
SELECT EXISTS(SELECT 1 FROM changesets r
              WHERE r.reverts_id = C AND <r is in-effect>);
```

`revert_changeset(X)`는 **X가 현재 in-effect가 아니면 `RAISE`**(이미 되돌려진 걸 또 되돌리기 금지 = 더블클릭 멱등). redo는 X(원래 타겟)가 아니라 그 revert 변경셋을 새 타겟으로 부르므로 같은 가드를 통과한다. 정확한 CTE는 빌드에서 쓰되, *술어의 정의*는 위로 고정 — 읽기 계약의 "되돌림 여부"도 같은 술어를 쓴다.

**빈 되돌리기:** 타겟의 대상이 그 시점 하나도 전이되지 않으면(예: 진술이 이미 전부 손수 archived) revert 변경셋을 만들지 않고 `RAISE`('nothing to revert') — 빈 변경셋을 남기지 않는다(넣기 RPC의 "빈 changeset 금지"와 같은 결).

## 5. pending 관계 해소

엔진이 애매·충돌이라 미뤄둔 관계 제안. pending 동안 **관계 행은 없고**, 제안은 `relation`·`pending` 변경셋의 `changes.data`(예약된 `target_id` + `{type, from_id, to_id}`)에만 산다(relation-design §6).

### 5.1 적용 — pending→applied, 행 생성

`apply_pending_relation(p_changeset_id) → uuid` (적용된 관계 id):

- 변경셋이 `type='relation'` AND `status='pending'`일 때만(아니면 `RAISE`).
- **끝점 무결성 먼저.** 제안 대기 중 끝점 진술이 archived됐으면(stale 제안) active 관계를 가린 진술에 걸 수 없다 — **양끝 active가 아니면 `RAISE`**('endpoint no longer active'). 조용히 거절로 바꾸지 않는다(적용을 눌렀는데 거절되는 부작용 금지). 검토함 화면은 stale 제안에 적용 버튼을 안 띄워 이 `RAISE`를 사전 차단한다.
- 그 변경셋의 단일 change에서 `data`(예약 `target_id`·type·from·to)를 읽어 `statement_relations` 행 생성 — **예약된 `target_id`를 id로** 써서 changes.target_id가 그대로 유효하게.
- **댕글링 방지 (A).** 같은 `(from,to,type)`가 다른 글의 잇기로 이미 active면(relation-design이 인정한 best-effort 중복) 예약 id로 행이 안 생긴다. 이때 `change.target_id`가 존재하지 않는 관계를 가리키지 않도록, **이미 있는 관계의 실제 id로 `change.target_id`를 갱신**하고(그 행이 이 적용의 산물로 간주됨) 변경셋을 applied로 닫는다. 즉 `INSERT ... ON CONFLICT (from_id,to_id,type) DO NOTHING RETURNING id`로 새 행 id를 얻고, NULL이면 기존 행 id를 조회해 change에 반영한다. 반환값은 어느 경우든 **실재하는 관계 id**.
- 변경셋 `status='applied'`. 이제 일반 applied 관계와 동일 — 꺼내기에 비치고(충돌이면 ⚡), `relation` 변경셋(건당 1개)을 타겟으로 §4.2 되돌리기 가능.
- author: `relation` 변경셋은 shape상 `author_id IS NULL`(엔진 제안이라). 적용은 status 전이일 뿐 author를 찍지 않는다 — 누가 적용/거절했나는 v1(1인 space)에서 유일 멤버라 자명하고, 원장이 엔진·사람 해소를 구분 못 하는 한계는 §10(resolver author)로 남긴다.

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
- **성능 (F).** 현재 pending 가드는 `changes.data->>'from_id'` 등 JSONB를 스캔한다(relation-design이 인정한 best-effort). rejected를 더하면 스캔 대상이 늘고 rejected는 안 지워져 누적된다. 거절이 쌓여 잇기 워커가 느려지면 `(space_id, from_id, to_id, type)` 함수 인덱스 또는 제안 트리플 정규화 컬럼을 들인다 — 해제 조건은 dogfooding 실측이라 빌드 1차엔 미루되, 누적 누수를 §10에 명시.

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

supabase 규칙: 변경당 1파일, `supabase migration new`.

> **순서 불변식 (D).** `ALTER TYPE ... ADD VALUE`로 더한 enum 값은 **같은 트랜잭션에서 참조할 수 없다**(Postgres "unsafe use of new value"). 그러므로 `rejected`·`restore` 추가는 그 값을 쓰는 **모든 것(CHECK 수정·RPC)과 별도 마이그레이션 파일**이어야 한다. 관계 엔진이 `relation` 값에서 이미 겪은 패턴(`chk_changeset_shape`를 별 파일로 뺀 것)을 그대로 따른다 — 안 지키면 `db reset`이 깨진다.

1. **파일 1 — enum 값만** — `changeset_status`에 `rejected`, `change_action`에 `restore`. (값 추가만, 아무 참조 없음.)
2. **파일 2 — `chk_data_by_action` 수정** — `restore`도 `archive`처럼 data 없음: `(action IN ('create','modify') AND data IS NOT NULL) OR (action IN ('archive','restore') AND data IS NULL)`. (`restore` 값을 참조하므로 파일 1 이후.)
3. **파일 3 — 조작 RPC** — §7.1 다섯 + 권한.
4. **파일 4 — 재제안 가드 수정** — `apply_relation_changesets`의 pending 가드에 `rejected` 포함(§6). `CREATE OR REPLACE`.

작성 후 `supabase db reset && supabase gen types ... > apps/server/src/infra/database.types.ts`, 생성 타입 동반 커밋.

## 9. 테스트 범위

실 사용자 시나리오·사전검증 필요한 엣지만(런타임·커버리지용 금지):

- **연쇄 archive**: 진술 빼기 → 걸린 관계 자동 archive(트리거). 글 되돌리기 → 그 글의 진술·관계 + cross-source 관계까지 빠짐.
- **revert 멱등·겹침**: double-revert 가드(in-effect 술어), S2만 빼고 글 되돌리기 → redo 시 S2 보존(§4.4), redo 대칭(archive↔restore), 빈 되돌리기 `RAISE`.
- **벡터 동기화**: archive/restore가 `ingestion_status='pending'` + notify를 찍어 워커가 벡터 삭제/재적재.
- **pending 해소 후 상태**: 적용 → 행 생성·꺼내기 비침, 거절 → rejected·재제안 안 됨, stale 제안(끝점 archived) 적용 시 `RAISE`, 같은 쌍이 이미 active일 때 적용 → 댕글링 없이 기존 id 반영(§5.1 A).

## 10. 보류 / 후속 — 해제 조건과 함께

- **충돌 "승자 고르기 → replaces"** + `conflict` 변경셋 type 거취 — 검토함 설계(relation-design §11). 실제 충돌 데이터 관측 후.
- **거절 후 되살리기** — 마음 바뀐 거절을 되돌리는 경로. 작은 후속, 요구되면.
- **진술 직접 작성·수정** — 진술 불변·author 규칙과 부딪혀 별도 설계. 실제 UX 필요 입증 시.
- **원본 수정 설탕** — revert-ingestion + create-source 조립. 원본 수정 마찰이 dogfooding에서 입증되면.
- **진술 modify 시 stale 관계 재평가(`recheck`)** — 07 기존 보류. 진술 modify가 실제로 생기는 날.
- **resolver author 기록** — pending 적용/거절의 주체(원장이 엔진·사람 해소를 구분 못 하는 한계, §5.1). 협업(멀티 멤버) 단계에서.
- **재제안 가드 인덱스/정규화** — rejected 누적으로 JSONB 스캔이 느려지면(§6 F). 해제 조건은 dogfooding 실측.
