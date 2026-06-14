# 넣기 설계 — 진술 엔진 (save-engine-v2)

> 글(source)을 진술로 쪼개 저장하는 파이프의 흐름 설계. [`schema-design.md`](schema-design.md)가 정한 스키마·RPC 계약 위에서, 그 문서가 후속으로 넘긴 흐름(박제 시점, 실패 정리 경로)을 확정한다. 이 문서를 보고 바로 넣기 빌드 세션을 띄울 수 있는 수준을 목표로 한다.
>
> 짝 문서: [`retrieval-design.md`](retrieval-design.md) (꺼내기). 넣기와 꺼내기는 한 고리라 한 세션에서 같이 설계했다.

---

## 0. 이 문서가 정하는 것 / 정하지 않는 것

- **정한다**: 글이 들어와 진술·벡터가 되기까지의 흐름 — 동기/비동기 경계, 추출 단계의 LLM 호출 구조와 절단 원칙, changeset 생성 시점·내용물, 실패 처리, 워커 구조. schema-design이 비워둔 RPC 추가분(`create_source`, 수동 재개 RPC)의 계약.
- **정하지 않는다**: 절단 기준의 세부 값(프롬프트 문구·임계값 — 테스트 하니스에서 실제 데이터로 보정), 관계 잇기·충돌 표시(관계 엔진), 확인/수정 화면, 되돌리기·빼기 흐름, 워커의 구현 코드. **글을 던지는 입구가 어느 화면인지**(채팅 통합 여부 등)도 범위 밖 — 이 문서는 tRPC 라우터 → `create_source` 경로까지만 정하고, v1 드래프팅 흐름의 거취는 화면 작업에서 정한다.

---

## 1. 전체 그림

```
사용자가 글을 던짐
  │
  ├─ [동기] create_source RPC
  │     source 박제 (extraction_status='pending') + 큐 notify
  │     → 응답: source_id  (여기서 사용자 대기 끝)
  │
  └─ [비동기, 워커]
        ① 추출: LLM 1콜 — source body → [{content, type, confidence?, index}]
             → apply_ingestion_changeset RPC (한 트랜잭션):
                statements + statement_sources + changeset(applied) + changes
                + source.extraction_status='completed'
        ② 임베딩: 진술 status 보고 Qdrant upsert/delete
             → complete_statement_ingestion
```

## 2. 진입점 — 박제까지만 동기

사용자가 글을 던지면 **source 박제까지만 동기로 처리하고 즉시 응답한다.** 추출(LLM)·임베딩은 전부 워커.

- 동기 구간: `create_source` RPC — source 생성(`extraction_status='pending'`) + `statement_sync` 큐 notify. 응답은 `source_id` 하나. 화면은 이 id로 처리 상태를 추적한다.
- 근거:
  - **던지기는 가벼워야 한다** — "다듬지 않고 글로 던진다"(09)는 LLM 응답(수 초)을 기다리는 행위가 아니다. 접수 확인은 즉시, 쪼개진 결과는 따라온다.
  - **즉시성의 수혜자가 없다** — 추출을 동기로 해서 얻는 "쪼개진 진술을 응답에 싣기"는 확인/수정 화면(별도 작업)이 생겨야 쓸모가 있고, 그 화면도 "박제 응답 + 추출 완료 구독/폴링"으로 만들 수 있다.
  - **실패 격리** — 추출 실패가 "저장 실패"로 보이면 안 된다. 원문은 무사히 박제됐고 재시도만 하면 되는 상황이다.

### `create_source` 계약 (schema의 RPC 골격에 추가)

직접 쓰기는 RLS로 막혀 있으므로(SELECT-only) 박제도 RPC 경유다.

```
create_source(p_space_id uuid, p_body text, p_session_id uuid?) → source_id
```

- `SECURITY DEFINER`, 호출자 검증: `is_space_member(p_space_id)`.
- `author_id = auth.uid()`, 생성 후 `pgmq.send`로 `statement_sync` notify.

## 3. 추출 — LLM 1콜로 쪼개기·종류·확신도

> **장문 확장**: 임계선(1,500토큰)을 넘는 초장문 입력은 청크로 갈라 병렬 추출한다 — [`long-input-chunking.md`](long-input-chunking.md). 임계선 이하는 이 장 그대로 1콜이고, 분할은 워커 안에서만 보이며 changeset 계약(4장)은 동일하다.

source body를 넣으면 `[{content, type, confidence?}]`가 한 번에 나오는 구조화 출력 **1콜**. v1(saving.ts)의 split→judgment→meta 다단은 쓰지 않는다 — judgment는 "기존 문서와 합칠지" 판단이라 검색 결과 주입이 필요해 분리가 필수였고, meta는 합성 문서의 제목·태그용이었다. 둘 다 v2에 없다.

- 쪼개기와 종류 판단은 한 머리에서: 어디서 끊을지는 그 조각이 claim/question/todo인지와 얽혀 있다. 확신도(claim만 certain/guess)의 단서("~인 것 같다" vs "~로 확정")도 쪼개는 순간 가장 선명하다.
- 모델 티어는 **standard**: 절단 품질이 첫 출시 품질을 좌우하는 가장 큰 미정 항목(09)이라 비용으로 흔들 자리가 아니다. 티어 조정은 하니스에서 데이터 보고.

### 절단 원칙 (프롬프트의 뼈대 — 세부는 하니스에서 보정)

1. **한 진술 = 하나의 '왜'.** 두 결정이 한 문장에 있으면 두 진술로, 한 결정의 부연이 세 문장이면 한 진술로. 문장 수가 아니라 의미 단위.
2. **단독으로 읽히게.** 대명사·생략을 원문 맥락으로 해소해 그 진술만 떼어 읽어도 뜻이 서게 한다. 검색·묶음이 진술 단위로 일어나므로 자기완결성이 곧 검색 품질.
3. **요약·창작 금지.** 원문에 없는 내용을 만들지 않고, 확신 수준을 과장하지 않는다. 다듬되 보태지 않는다.
4. **같은 글은 같은 모양으로.** 일관성이 흔들리면 나중의 합치기·충돌 판단이 흔들린다(09). 하니스가 측정할 목표.

### 출력 순서와 locator

**추출 출력은 원문 등장 순서를 따른다.** 그 순번을 `statement_sources.locator`에 `{"index": n}`으로 기록한다(schema가 형식을 구현 단계로 열어둔 자리). 한 트랜잭션에서 생긴 진술들은 `created_at`이 전부 같아 순서가 안 나오므로, 원문 순서가 필요한 모든 화면(확인/수정, 원본 상세, 꺼내기의 묶음 안 정렬)이 이 값에 기댄다. 순서는 추출하는 순간에만 공짜다 — 나중에 되짚으려면 비싸고 부정확하다. 문자 범위 같은 정밀 locator가 필요해지면 같은 jsonb에 필드를 보탠다.

### 노이즈 — 별도 필터 없음

"진술이 안 나오는 텍스트는 추출되지 않는다"로 정의를 닫는다. 인사말·추임새처럼 '왜'가 없는 텍스트는 claim/question/todo 어디에도 안 걸려 자연스럽게 빠지고, 원문은 source에 무손실 박제돼 있어 유실이 아니다. 09가 열어둔 별도 노이즈 필터 기준은 만들지 않는다. 과소·과잉 추출의 경계 보정은 절단 기준과 함께 하니스에서.

## 4. changeset — 추출 성공 직후 한 트랜잭션

워커가 추출 성공 직후 `apply_ingestion_changeset`을 1회 호출한다. 한 트랜잭션에서:

1. `statements` N개 생성 (`ingestion_status='pending'` → 임베딩 단계로)
2. `statement_sources` N개 (locator `{"index": n}` 포함)
3. `changesets` 1개 — `type='ingestion'`, **`status='applied'`**(07: 사람 주도 변경은 조용히 즉시 반영), `source_id`, `author_id` = source 제출자(`sources.author_id`에서 파생)
4. `changes` N개 — 진술마다 `{action:'create', target_type:'statement', target_id, data:{content,type,confidence}}`
5. **`source.extraction_status='completed'`** — 같은 트랜잭션이어야 한다. 적용과 완료 표시가 갈라지면 적용 성공 후 크래시 시 워커가 같은 source를 재추출해 진술이 중복 생성된다.

커밋 후 `statement_sync` 큐에 notify를 쏜다(schema 5.3의 "저장 RPC가 notify" 계약). 평소엔 같은 사이클의 ②(임베딩)가 pending 진술을 집어가지만, 추출 직후 워커가 죽으면 이 notify가 재기동 후 임베딩을 깨우는 안전망이다.

```
apply_ingestion_changeset(p_source_id uuid, p_statements jsonb) → changeset_id
-- p_statements: [{content, type, confidence?, index}]
```

- **source는 changes에 넣지 않는다** — `changesets.source_id`가 이미 가리킨다. `target_type='source'`는 원본 빼기(manual)용.
- **진술이 0개면**(노이즈뿐인 글) changeset을 만들지 않고 `complete_source_extraction`만 호출 — 빈 changeset을 남기지 않는다. schema의 RPC 골격에 두 RPC가 다 있는 이유.
- schema-design 5.3의 RPC 설명("source+statements+… 원자 생성")에서 **source 생성은 빠진다** — 박제가 동기 단계로 먼저다(이 문서가 그 미결을 확정, schema 쪽 문구도 함께 수정).

### 기존 마이그레이션과의 관계 (빌드 범위)

저장소 구현(`20260611091643_statement_sync_queue_rpcs.sql`)의 `apply_ingestion_changeset`은 **동기형 임시 계약**이다 — source 박제와 진술 저장을 한 호출에 묶고(`p_body`를 직접 받아 `extraction_status='completed'`로 박제), 헤더 주석이 "미리 박제된 pending source에 진술을 붙이는 비동기 적용 RPC는 저장 파이프 흐름(후속)에서 확정"이라고 이 문서로 결정을 넘겼다. 이 문서가 그 결정을 2단계(동기 박제 → 비동기 적용)로 확정했으므로, **넣기 빌드 범위에 기존 RPC를 이 계약대로 재작성하는 마이그레이션이 포함된다**:

- `apply_ingestion_changeset`을 `(p_source_id, p_statements)` 시그니처로 재작성 — 시그니처가 바뀌므로 `DROP FUNCTION` 선행(supabase 규칙). pending source 전제·완료 표시 동일 트랜잭션·`locator {"index": n}` 기록을 포함하고, 마이그레이션 헤더 주석의 "박제+저장 한 트랜잭션" 서술도 함께 갱신한다.
- `create_source`(2장)·`retry_source_extraction`·`retry_statement_ingestion`(5장)은 **신규 추가분**이다. `fetch_pending_*`·`complete_*`·`increment_*` 6종과 큐 소비 RPC(`read_sync_events`·`ack_sync_event`)는 기존 그대로 쓴다.

## 5. 실패 처리 — 지우지 않는다

### 재시도 (v1 패턴 계승)

- 추출 실패 → `increment_source_extraction_retry`: `retry_count` +1, `last_extraction_attempt`·`error_message` 기록. 상한 도달 시 `extraction_status='failed'`.
- `fetch_pending_sources`는 `pending`이면서 `retry_count < 상한`인 것만 반환. 인출은 시도 시각을 찍는 클레임이라, 실패한 행은 `(retry_count+1)×30초` lease가 지나야 재인출된다 — **선형 backoff가 기존 마이그레이션에 이미 구현돼 있다.** 상한값(기본 5)도 RPC 기본값으로 박혀 있다.
- 임베딩 실패도 완전 대칭: `increment_statement_ingestion_retry`.

### 실패한 source의 거취 (schema가 넘긴 미결의 확정)

- **지우지 않는다.** 원본은 무손실 박제가 존재 이유다. 추출이 영영 실패해도 source는 남고, 사용자의 글이 사라지는 경로는 만들지 않는다.
- `failed`는 끝 상태가 아니라 **자동 재시도가 멈춘 상태**다. 수동 재개 RPC로 정리 경로를 둔다:

```
retry_source_extraction(p_source_id uuid)      -- status→pending, retry_count 리셋, notify
retry_statement_ingestion(p_statement_id uuid) -- 대칭
```

  첫 출시에선 운영자 도구. 사용자용 "다시 시도" 버튼은 화면 작업에서 같은 RPC를 쓴다.
- 실패는 Sentry 알림(v1 동일) + `error_message`로 원인 보존.
- **임베딩 실패한 진술의 의미**: Postgres엔 존재하므로 원본 기준 조회(형제 수, 원본 상세류)에는 보이되, 벡터가 없어 뜻 검색에는 잡히지 않는다 — 검색 결과 묶음의 진술로는 나타날 수 없다. "반쯤 들어온" 상태가 검색 누락으로만 나타나고 데이터 유실은 아니다.

## 6. 워커 — 한 큐, 한 워커, 추출 먼저 임베딩 다음

- **깨우기**: `create_source`·`apply_ingestion_changeset`·archive 계열 RPC(빼기·되돌리기 설계에서 생길 미래 계약)가 모두 `statement_sync` 큐에 notify를 쏜다. 메시지는 "깨워라" 하나 — v1의 `document.deleted` 같은 즉시 정리 이벤트가 필요 없다. archive가 `ingestion_status='pending'`으로 되돌리는 선언적 동기화(schema 5.3)가 삭제를 흡수한다.
- **사이클**: 깨어나면
  1. `fetch_pending_sources` 순환 — 추출하고 `apply_ingestion_changeset`(0개면 `complete_source_extraction`만)
  2. `fetch_pending_statements` 순환 — 진술 `status`가 `active`면 Qdrant upsert, `archived`면 delete, 끝나면 `complete_statement_ingestion`
  3. 둘 다 빌 때까지 반복. ①이 pending 진술을 만들어내므로 이 순서면 한 번 깨어난 김에 임베딩까지 끝난다.
- **Qdrant**: 1진술 = 1 point, payload는 schema 5.3 그대로 — `{statement_id, space_id, content, type, confidence, created_at, embedding_model}`. 진술은 짧아서 임베딩 호출은 여러 진술을 한 번에 묶는 배치가 자연스럽다(배치 크기는 구현 단계 상수).
- **동시성·재사용**: v1 워커(infra/document-sync) 골격 그대로 — pgmq 배치 read + visibility timeout + ack, 아이템 단위 청크 병렬, Sentry 단계별 태깅. `infra/statement-sync`가 그 자리를 대체한다.
- **워커는 하나로 시작하지만, 인출은 이미 멀티 워커 안전**: `fetch_pending_*`가 `FOR UPDATE SKIP LOCKED` + lease 클레임으로 구현돼 있어 워커를 늘려도 같은 행을 이중 처리하지 않는다. 분리(처리량·단계 격리·배포 분리)가 필요해지면 RPC 수정 없이 워커 프로세스만 늘리면 된다.

## 7. 기존 코드의 거취 (빌드 세션 참고)

| 기존 | 거취 |
|---|---|
| `services/chat/saving.ts`의 split 단계 | 모양 재활용 — 단위를 '주제 합치기'에서 '진술 쪼개기'로. judgment(검색+합치기 판단)·meta(제목·태그)는 폐기 |
| `withStepContext` Sentry 패턴 | 재활용 |
| `infra/document-sync` 워커 골격 | 재활용 — `infra/statement-sync`로. propagation(연관 문서 재합성)·entity 계열은 폐기 |
| `prompts/entity-extraction`·`entity-resolution`·`memory-resynthesis` | 폐기 (Memory/엔티티 정지) |

## 8. 후속 / 미결

- **revert가 무르는 단위** — 빼기·되돌리기 설계(별도 작업)에서. schema가 넘긴 세 미결 중 박제 시점·실패 정리는 이 문서가 닫았고 이것만 남는다.
- **확인/수정 화면** — 추출 결과를 사람이 확인·고치는 흐름. 박제 응답 + 추출 완료 구독/폴링 위에 별도 작업.
- **절단 기준·노이즈 경계·검색 파라미터의 보정** — 테스트 하니스에서 실제 데이터로.
- **시간 backoff·워커 분리** — 운영 데이터가 요구할 때 (전환 경로는 6장에 명시).
- **glossary 갱신** — schema-design 8장의 매핑에 더해, 이 문서 기준 새 용어 없음.
