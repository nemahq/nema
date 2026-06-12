# Memory 저장 파이프라인 설계 (v1)

> Put-in 전체 흐름(드래프팅, Intent Router, 세션 관리)은 [put-in-and-pull-out-flow-design-v1.legacy.md](../put-in-and-pull-out-flow-design-v1.legacy.md) 참조.
> 이 문서는 저장 트리거 이후 — Phase 2(저장) → Phase 3(인제스천) → Phase 4(간접 영향 전파) — 에서 새롭게 설계된 흐름만 다룬다.

## 배경

기존 병합(merge) 모델에서 Memory + Revision 이력 모델로 전환. 핵심 변경:

- 문서 단위가 `Document` → `Memory` (주제/엔티티별 합성 문서, 증분 업데이트)
- 저장마다 Revision 기록 → 시간축 추적 + revert 가능
- 저장 이벤트 단위로 Revision을 묶는 History → PR 목록처럼 변경 맥락 조회 가능
- 하나의 저장이 여러 Memory를 동시 업데이트(fan-out)
- Phase 4 신설: 엔티티 기반으로 간접 영향받는 Memory 탐색 → 재합성

## 용어

| 용어 | 설명 |
|---|---|
| **Memory** | 주제/엔티티별 합성 문서. 새 정보가 들어올 때마다 증분 업데이트됨 |
| **History** | 한 번의 저장이 만든 Memory 변경들의 묶음 (`histories` 테이블) |
| **Revision** | Memory별 개별 변경 레코드 (`memory_revisions` 테이블). 하나의 History에 여러 Revision이 속함 |
| **extend** | 기존 내용에 추가 ("Stripe PM" + "결제 인프라 팀 리드") |
| **replace** | 기존 내용 대체 ("React 쓴다" → "Svelte로 전환") |
| **fan-out** | 하나의 저장이 여러 Memory를 동시 업데이트하는 것 |

---

## Phase 2: 저장

저장 트리거 이후 Supabase에 Memory가 기록되기까지의 흐름. 사용자 관점에서 Non-blocking — 저장 즉시 새 입력을 시작할 수 있으며 백그라운드에서 처리된다.

### 흐름

```
1. 저장 트리거 → Frontend: 저장 큐 UI에 항목 추가 (로딩 상태)
   Frontend → Backend: 확정된 body 전달

2. Backend → Supabase: History 생성
   histories 테이블에 새 행 삽입
   {
     "id": "...",
     "source_session_id": "...",
     "source_draft_body": "저장 시점의 초안 본문",
     "user_id": "...",
     "created_at": "..."
   }
   이하 모든 Revision은 이 history_id를 공유한다

3. Backend → LLM: 멀티 토픽 분리 판단
   입력: body
   출력: 단일 문서 유지 또는 분리된 body 목록

4. [이하 body별로 반복]

   4-1. Backend: 관련 Memory 검색 결과 확보
        - Phase 1 검색 완료 + 분리 안 됨: 결과 재사용
        - 그 외: Phase 2에서 직접 검색

   4-2. Backend → Supabase: 기존 태그 풀 조회

   4-3. Backend → LLM: 메타 필드 생성 + update_type 판단
        입력: body + 관련 Memory 목록 + 기존 태그 풀
        판단: 관련 Memory와 주제 범위가 일치하는가?
          → 주제 범위 밖 또는 관련 Memory 없음: create
          → 주제 범위 안: extend 또는 replace

        출력 (fan-out: 배열, create/extend/replace 혼재 가능):
        [
          {
            "title": "...",
            "tags": [...],
            "summary": "...",
            "update_type": "create" | "extend" | "replace",
            "target_id": "existing_memory_id" | null,  // create 시 null
            "final_body": "..."
          },
          ...
        ]

   4-4. Backend → Supabase: DB 기록
        create → memories 테이블에 새 행 삽입 (ingestion_status = pending)
        update → 기존 행 갱신 (updated_body로 교체, ingestion_status = pending)

   4-5. Backend → Supabase: Revision 기록
        memory_revisions 테이블에 revision 삽입
        {
          "memory_id": "...",
          "history_id": "...",  // 2번에서 생성한 History
          "prev_body": "갱신 전 본문",  // create 시 null
          "next_body": "갱신 후 본문",
          "update_type": "create" | "extend" | "replace",
          "source": "direct" | "propagated",  // direct: Phase 2 직접 수정, propagated: Phase 4 간접 전파
          "created_at": "..."
        }
        상세 스키마 설계는 별도 결정

5. Backend → Frontend: 저장 완료 응답
   성공 → 완료 표시
   실패 → 에러 표시 + 드래프트 복구 + 재시도 버튼

6. → Phase 3 트리거
```

### Memory 스키마

| 필드 | 타입 | 생성 주체 | 설명 |
|---|---|---|---|
| `id` | uuid | 시스템 | Memory 고유 식별자 |
| `title` | string | Phase 2 LLM | 소프트 앵커: 3-8 단어 지향 |
| `tags` | string[] | Phase 2 LLM | 소프트 앵커: 3-7개 지향. 기존 태그 풀과 수렴 |
| `summary` | string | Phase 2 LLM | 소프트 앵커: 1-2문장 지향 |
| `body` | string | LLM | 최신 본문 |
| `category` | string | Phase 2 LLM | 분류 경로. 스키마 선반영, 그룹핑 로직/뷰는 별도 설계 |
| `ingestion_status` | enum | 시스템 | `pending` → `completed` → `failed` |
| `created_at` | timestamp | 시스템 | |
| `updated_at` | timestamp | 시스템 | |
| `user_id` | uuid | 시스템 | 소유자 |

> 소프트 앵커는 LLM 프롬프트에 수치를 명시하되 시스템 검증으로 강제하지 않는다.

### History 스키마

| 필드 | 타입 | 생성 주체 | 설명 |
|---|---|---|---|
| `id` | uuid | 시스템 | History 고유 식별자 |
| `source_session_id` | uuid | 시스템 | 저장을 트리거한 세션 |
| `source_draft_body` | string | 시스템 | 저장 시점의 초안 본문 |
| `user_id` | uuid | 시스템 | 소유자 |
| `created_at` | timestamp | 시스템 | 저장 이벤트 발생 시각 |

Phase 2 직접 변경(`source: direct`)과 Phase 4 간접 전파(`source: propagated`) Revision 모두 동일한 `history_id`를 공유한다. Phase 4가 Phase 3를 재트리거하여 연쇄 발생하는 Revision들도 원래 저장을 유발한 History를 가리킨다. NEM-26(시간축 추적)·NEM-81(Lint)은 `source = direct`만 필터링해 "의도된 변경"을 추적한다.

### update_type 판단 (3-way 분류)

단일 필드 `update_type`으로 세 가지 중 하나를 분류한다:

- **create**: 관련 Memory가 없거나 주제 범위 밖 (prev_body = null)
- **extend**: 기존 내용이 여전히 사실이면서 새 정보가 추가되는 경우
- **replace**: 기존 내용이 더 이상 현재 사실이 아닌 경우

분류 규칙:
- 애매하면 **replace 기본값** — 잘못된 extend는 stale fact를 조용히 유지하지만, 잘못된 replace는 이력에서 복구 가능 (비대칭성)
- Memory title/summary가 "현재 상태" 관점이면 변경 → replace, "이력/타임라인" 관점이면 추가 → extend
- 부분 업데이트(일부 사실만 변경)도 replace로 분류. final_body에서 유효한 사실은 유지
- replace의 final_body: 신규 내용 주도, 이전 사실은 "이전엔 X, 지금은 Y" 형태로만 보존

### Fan-out

하나의 저장이 여러 Memory를 대상으로 동시 업데이트를 트리거할 수 있다. (예: "팀장이 김철수에서 이영희로 바뀌었다" → 팀 구성 Memory + 김철수 프로필 + 이영희 프로필 동시 업데이트)

- **fan-out 상한 없음**: LLM이 Draft 내용 기반으로 관련 Memory를 자유롭게 선택. 자연스러운 제약은 벡터 검색 파라미터.
- **벡터 검색**: `limit = 20`(안전망), `scoreThreshold`로 실질적 필터링 (임계값은 실제 데이터 보고 튜닝)
- **create + update 혼재 허용**: 동일 Draft에서 create와 update가 섞일 수 있음
- **순차 처리**: fan-out 대상을 순차 처리 (동일 Memory 동시 업데이트 방어)

동일 Memory에 동시 업데이트가 발생하는 경우 순서 보장이 필요하다. 처리 방식은 별도 설계 예정.

구현 시 함수명은 `fanOut` 대신 동작을 서술하는 이름(예: `propagateToRelatedMemories`)을 권장한다.

### 멀티 토픽 분리

- 분리 판단은 **보수적으로**: 애매하면 단일 문서 유지
- 분리된 것 중 일부 저장이 실패해도 성공한 것은 유지 (부분 실패 허용)

### 동시 저장 처리

Phase 2는 **큐로 순차 처리**한다. 앞선 저장 결과를 반영한 상태에서 다음 저장의 유사 검색 + create/update 판단이 수행되므로 충돌 없음.

### 변경 사항 인지 (approve/reject 없음)

저장 파이프라인에는 사용자의 approve/reject 게이트 단계를 두지 않는다. 이유:

- 코드와 달리 Memory는 diff 이력 뷰(NEM-90)에서 언제든 revert 가능 → 사전 gate보다 사후 confirm이 비용 효율적
- 신뢰도 쌓인 후 approve 단계는 bypass 대상이 되기 쉬움
- 팀 스페이스의 더블 체크 니즈는 저장 파이프라인의 approve가 아니라 "팀원 변경사항 피드/알림" 구조가 자연스러움

대신 저장 완료 직후 변경 사항 요약을 사용자에게 인지시키고, 필요시 diff 이력 뷰에서 revert하는 방향.

---

## Phase 3: 비동기 인제스천

Supabase에 저장된 Memory를 임베딩(Qdrant) + 그래프(Neo4j)로 변환하는 배치 처리. pending 소진 후 Phase 4를 트리거한다.

### 배치 트리거

```
Phase 2 저장 완료 → ingestion_status = pending
  → 현재 인제스천 실행 중이 아니면 배치 시작

배치 실행:
  1. pending Memory 전체 수집
  2. 임베딩 생성 (Voyage AI) → Qdrant 저장
  3. 엔티티/관계 추출 (LLM) → Neo4j 저장
  4. 성공한 Memory: ingestion_status = completed
     실패한 Memory: pending 유지
  5. pending 재확인
     → pending 있음: 즉시 다음 배치 (Phase 4 트리거 없음)
     → pending 없음: Phase 4 트리거 → 대기
```

### 인제스천 상태

| 상태 | 의미 | 전환 시점 |
|---|---|---|
| `pending` | 인제스천 대기 | Phase 2 저장/수정 시 항상 설정 |
| `completed` | 인제스천 완료 | 배치 처리 성공 시 |
| `failed` | 반복 실패 | 연속 N회 실패 시 (수동 확인 필요) |

Phase 2가 Memory를 저장/수정할 때 **항상 `pending`으로 덮어쓴다.**

---

## Phase 4: 간접 영향 전파

Phase 3에서 추출된 엔티티/관계를 기반으로 영향받는 Memory를 탐색하고 재합성한다.

### 목적

새 Memory 추가 또는 기존 Memory 업데이트 시, 같은 엔티티를 공유하는 다른 Memory들이 outdated될 수 있다. Phase 4는 이를 감지하여 최신 컨텍스트로 재합성한다.

### 흐름

```
1. 트리거: Phase 3 pending 소진 후

2. Backend → Neo4j: 이번 배치에서 변경된 엔티티와 연결된 Memory 탐색
   입력: Phase 3에서 처리된 Memory ID 목록
   출력: 영향받는 Memory ID 목록

3. Backend: 재합성 큐에 추가
   - 이미 큐에 있는 Memory는 중복 추가하지 않음
   - 방금 Phase 3에서 처리된 Memory 자신은 제외

4. Backend → LLM: 큐의 Memory 순차 재합성
   입력: 기존 Memory body + 관련 엔티티 컨텍스트 (Neo4j에서 조회)
   출력: 재합성된 body + title + tags + summary

5. Backend → Supabase: 재합성된 Memory 저장 + Revision 기록 (4-4, 4-5와 동일, `source: propagated`)
   Revision의 history_id는 이 전파를 유발한 원래 저장의 History와 동일
   ingestion_status = pending → Phase 3 재트리거
```

### 동일 Memory 동시 업데이트

fan-out 과정에서 동일 Memory에 동시 업데이트가 발생하는 경우 순서 보장이 필요하다. 처리 방식은 별도 설계 예정.

### 향후 고려사항

- **전파 깊이 제한**: Phase 4 → Phase 3 → Phase 4 순환 가능. 최대 깊이(hop) 제한 필요. 참조 기본값 2-3 hop, 실제 cascade 로그 보고 튜닝
- **재합성 우선순위**: 최근 접근된 Memory, 자주 참조된 Memory를 우선 재합성
