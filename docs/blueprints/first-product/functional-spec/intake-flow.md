# 넣기 플로우

> 사용자 입력 → Digest 추출까지를 다룬다. 충돌·중복 판정과 되돌리기는 [`review-flow.md`](review-flow.md) 몫.

> **2026-08-06 스코프 재정의 반영 — 본문 재검토 필요.** 넣은 직후의 확인 게이트를 없앴으므로 이 문서가 "열린(pending) 리뷰", "리뷰를 확정하거나 버려야", "버려진 리뷰 원문 상태" 같은 표현으로 전제하던 상태가 더 이상 생기지 않는다. 정리가 끝나면 사람 확인 없이 바로 저장되고, 초안에 남는 것은 **아직 정리 안 됨·정리 중·정리 실패·결과 없음** 넷뿐이다. 체크된 케이스는 만들었다는 기록이라 그대로 두되, 게이트를 실제로 걷어내는 슬라이스에서 해당 Given/Then을 함께 손봐야 한다.

### 함께 보는 문서

- [기능 명세서 인덱스](README.md)
- 표면 인벤토리(`../surface-inventory.md`): Space 오버뷰, 초안

### 시나리오

## Source 제출

### 케이스 목록

- [x] Source 제출
- [x] 빈 입력창 제출 버튼 비활성화

### 케이스 상세

#### Source 제출

- **Given**: 유저가 Space 오버뷰에 있다.
- **When**: 넣기 입력창에 내용을 작성하고 제출 액션을 실행한다.
- **Then**:
  1. Source가 생성된다.
  2. Digest 추출이 시작된다.
  3. 추출이 진행되는 동안 그 원문이 "초안"에 진행 중 상태로 나타난다.
- **관여 화면**: Space 오버뷰, 초안
- **확정 (2026-07-12, PR #385)**: Space 오버뷰 인라인 컴포저(`ChatInput` 재사용)로 구현. staging API + 실계정 라이브 검증 완료(`design-decisions-log.md` 참고).
- **범위 참고 (2026-07-15, PR #415)**: 제목이 채워지는 시점이 바뀌었다 — 이전엔 Digest 추출(무거운 콜) 결과에 얹혀 나왔지만, 이제 Source 생성 직후 별도의 가벼운 콜(nano, body 앞부분만)이 응답을 기다리지 않고 떠서 채운다. Then절은 제목을 언급하지 않아 케이스 자체엔 영향 없음 — 초안 목록이 제목 없는 카드를 body 미리보기로 대신 그리는 기존 폴백을 그대로 쓰므로 화면상 새 상태가 생기지 않는다. BE 코드 레벨(`source-service.test.ts`)로만 확인, 실동작 확인 대상 아님.

#### 빈 입력창 제출 버튼 비활성화

- **Given**: 유저가 Space 오버뷰 넣기 입력창에 내용을 입력한 상태다.
- **When**: 입력한 내용을 모두 지운다.
- **Then**: 제출 액션이 비활성화된다.
- **관여 화면**: Space 오버뷰
- **확정 (2026-07-12, PR #385)**: `ChatInput`의 `!hasContent` 내부 가드로 구현.

## 초안 관리

### 케이스 목록

- [x] 처리 중 취소
- [x] 초안에서 Digest 추출 실행
- [x] 초안에서 Source 삭제
- [x] 대기 중인 초안 일괄 삭제
- [x] 초안에서 Space 재지정
- [x] 처리 중 상태에서 액션 잠금 (2026-07-14, Kyle 실동작 확인 완료)
- [x] 초안에서 Source 제목 편집 (2026-07-14, Kyle 실동작 확인 완료 — 재추출 후 편집값 유지 회귀 확인 포함)
- [x] 초안에서 Source 원문 편집
- [x] Digest 추출 실패
- [x] Digest 추출 결과 없음
- [x] 결과없음 상태 정리 버튼 비활성화 (원문 수정 전까지)
- [x] 버려진 리뷰 원문 상태 아이콘 미표시
- [x] 초안 목록 빈 상태
- [x] LNB 초안 버튼 조건부 노출
- [x] LNB 초안 버튼 상태 표시

### 케이스 상세

#### 처리 중 취소

- **Given**: 유저가 초안에서 Digest 추출이 진행 중인 Source를 보고 있다.
- **When**: 취소 액션을 실행한다.
- **Then**:
  1. 진행 중이던 Digest 추출이 멈춘다.
  2. 평범한 대기 상태로 돌아간다.
  3. Space 셀렉트, Digest 추출 실행, 삭제 액션이 다시 열린다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-13, PR #394)**: Then #1·#2와 Then #3의 "Digest 추출 실행·삭제 액션이 다시 열린다"는 구현·검증됨 — DB `cancel_source_digestion`(재클레임 불가능한 `cancelled` 상태로 전환) + 인메모리 `AbortController`로 떠 있는 LLM 콜 중단(`digestion-cancellation.test.ts`, `digestion.test.ts`의 취소 테스트 5종, `source-service.test.ts`로 코드 레벨 검증).
- **확정 (2026-07-13, PR #399)**: Then #3의 "Space 셀렉트가 다시 열린다"도 "초안에서 Space 재지정" 슬라이스 랜딩으로 구현됨 — cancelled 상태는 `DraftIdleActions`를 풋터로 쓰고, 여기 Space 셀렉트가 포함된다. 세 액션 모두 확인됐으므로 체크.

#### 초안에서 Digest 추출 실행

- **Given**: 유저가 초안에서 cancelled(취소 뒤 평범한 대기) 상태인 Source를 보고 있다.
- **When**: Digest 추출 실행 액션을 실행한다.
- **Then**: Digest 추출이 시작되고, 그 원문이 진행 중 상태로 전환된다.
- **관여 화면**: 초안

#### 초안에서 Source 삭제

- **Given**: 유저가 초안에서 평범한 대기 상태(cancelled·failed·empty)인 Source를 보고 있다.
- **When**: 삭제 액션을 실행한다.
- **Then**:
  1. 그 Source가 즉시 삭제되고 초안 목록에서 제거된다.
  2. 휴지통·보관 기간 없이 완전히 삭제된다.
- **관여 화면**: 초안

#### 대기 중인 초안 일괄 삭제

- **Given**: 유저가 초안 화면에 있고, 처리 중이 아닌(대기 중) 초안이 1개 이상 있다.
- **When**: 대기 초안 일괄 삭제 액션을 실행하고 확인한다.
- **Then**: 처리 중이 아닌 초안이 모두 한 번에 삭제된다.
- **관여 화면**: 초안
- **범위 참고 (PR #432)**: `source.deleteMany`로 배치 삭제. 이전엔 `source.delete`를 개수만큼 동시 호출해 tRPC 배치 링크 URL이 Fastify `maxParamLength`를 넘겨 대량 삭제가 전체 실패하던 버그가 있었음(#432에서 수정) — 일부만 실패할 수 있어 `failedCount`를 토스트로 안내.

#### 초안에서 Space 재지정

- **Given**: 유저가 초안에서 평범한 대기 상태(cancelled·failed·empty)인 Source를 보고 있다.
- **When**: Space 셀렉트 액션을 실행해 다른 Space를 선택한다.
- **Then**: 그 Source가 선택한 Space로 즉시 재지정된다.
- **관여 화면**: 초안
- **확정 (2026-07-13, PR #399)**: `reassign_source_space` RPC(원본 Space·대상 Space 양쪽 멤버십 체크 — 대상 Space 접근권 없음은 `42501`, 상태 가드 실패·확정 대기 리뷰 있음은 `NM004`로 리뷰 반영 후 분리, `source-service.test.ts`)와 `DraftIdleActions`의 Space 셀렉트(`space.list` + `useReassignSourceSpace`, 선택 즉시 반영)로 구현.

#### 처리 중 상태에서 액션 잠금

- **Given**: 유저가 인증을 완료했고, 초안에 Digest 추출이 진행 중인 Source가 있다.
- **When**: 초안에 진입한다.
- **Then**: 그 Source 카드는 Space 셀렉트·Digest 추출 실행·삭제·제목 편집·원문 편집이 모두 비활성화되고, 처리 중이라 그렇다는 이유가 함께 표시된다. 취소 액션만 남는다.
- **관여 화면**: 초안
- **확정 (2026-07-14)**: Kyle이 staging에서 처리 중 카드에 네 액션 다 안 보이고 잠금 캡션+취소만 남는 것을 실동작으로 확인.
- **범위 참고**: 원문(body) 편집은 이후 별도 슬라이스로 추가된 기능 — `WorkingDraftDetailPanel`이 `DraftBodyView`를 `readOnly`로 렌더링해 처리 중엔 편집 자체가 불가능하다(정리 중인 내용을 고치거나 재트리거하면 앞뒤가 안 맞기 때문). 다섯 번째 잠금 항목으로 반영.

#### 초안에서 Source 제목 편집

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있다.
- **When**: 제목 편집 액션을 실행하고 새 제목을 입력한다.
- **Then**: 그 Source의 제목이 즉시 반영된다.
- **관여 화면**: 초안
- **범위 참고**: cancelled·failed·empty 셋 다 "평범한 대기 상태"라 전부 편집 가능(Extract/Delete와 달리 failed/empty를 좁힐 이유가 없다 — BE 가드도 `digestion_status<>'pending'` 전체를 허용). 다이얼로그(`EditSourceTitleDialog`) 저장 시 `source.updateTitle` 뮤테이션 성공 후 `listPending` 쿼리를 invalidate해 반영 — 코드 레벨(typecheck/lint/test)로 확인됨.
- **확정 (2026-07-14)**: Kyle이 staging에서 제목 편집 즉시 반영 + 재추출 후 편집값 유지(회귀 방지 확인 포함)를 실동작으로 확인.
- **범위 참고 (2026-07-15, PR #415)**: 메커니즘이 바뀌었다 — `sources.title_edited` 플래그는 제거됐고, 제목 생성 자체가 디제스천에서 완전히 분리됐다(Source 생성 시점 1회, 별도 nano 콜). 재추출(`complete_source_digestion`/`create_ingestion_review`)은 이제 title 컬럼을 아예 안 건드려 덮어쓸 경로 자체가 없다 — `fill_source_title`의 `title IS NULL` 가드가 "평생 한 번만 채워짐"을 구조적으로 보장한다. 사용자가 관찰하는 동작(제목 편집 후 재추출해도 유지됨)은 그대로이고 오히려 더 견고해졌을 뿐이라 체크박스·실동작 확인 기록은 유지.

#### 초안에서 Source 원문 편집

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있고, 열린(pending) 리뷰가 없다.
- **When**: 원문(body) 편집 액션을 실행하고 내용을 수정한다.
- **Then**: 그 Source의 원문이 즉시 반영된다. 이후 Digest 추출을 다시 실행하면 수정된 원문을 기준으로 새로 추출한다. 제목은 그대로 유지된다.
- **관여 화면**: 초안
- **범위 참고**: "평범한 대기 상태"가 실제로 편집 가능한 자리는 cancelled·failed·empty, 그리고 리뷰가 열렸다가 사람이 버린(discarded) 경우까지 넷이다 — 열린 pending 리뷰가 있으면 거부된다(`NM004`, 리뷰에 뜬 Digest 후보가 편집 전 원문에서 뽑힌 것이라 원문을 바꾸면 후보가 무효화되기 때문). 리뷰를 확정하거나 버려야 원문을 고칠 수 있다. 처리 중(digestion_status='pending')인 Source도 같은 이유로 거부된다.
- **확정 (2026-07-20, Kyle 실동작 확인)**: FE가 그 사이 착지했다 — `IdleDraftDetailPanel`의 body 인라인 textarea(blur 시 `useUpdateSourceBody` 저장)로 구현. cancelled·failed·empty·discarded 4개 상태 전부에서 편집 가능, 열린 pending 리뷰가 있으면 `NM004`로 거부되는 서버 가드 그대로 유지, 제목은 별도 뮤테이션이라 그대로 보존. 원문 편집 저장 + 재추출 시 수정된 원문 기준으로 동작하는 것을 Kyle이 실사용으로 확인해 체크.

#### Digest 추출 실패

- **Given**: 유저가 제출한 Source가 Digest 추출 중이다.
- **When**: 추출 과정에서 오류가 발생한다.
- **Then**:
  1. 그 Source는 평범한 대기 상태로 돌아간다.
  2. 실패했다는 안내가 표시된다.
  3. Digest 추출 실행 액션으로 다시 시도할 수 있다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-12, PR #385)**: "실패" 배지 표시(Then #2)만 이번 슬라이스에 구현됨. 재시도 액션(Then #3)은 초안 카드 액션 전체(취소·재시도·삭제·Space 재지정·제목 편집)와 함께 2차 슬라이스로 미룸 — 그래서 미체크로 남김.
- **범위 참고 (2026-07-13, PR #394)**: 위 노트가 가리키던 2차 슬라이스(취소·삭제·수동 추출 실행)가 반영됐지만, 재시도 액션은 cancelled 상태의 "수동 추출 실행"으로만 부분 커버되고(케이스 "초안에서 Digest 추출 실행" 참고) failed 상태에서의 재시도(Then #3)는 여전히 범위 밖 — 그래서 계속 미체크로 남김.
- **확정 (2026-07-14)**: `FOOTER_BY_STATUS`에서 failed도 `DraftIdleActions`를 풋터로 쓰도록 연결 — Then #3(재시도 액션)까지 구현됨. cancelled와 동일한 컴포넌트라 재시도(추출 실행)뿐 아니라 삭제·Space 재지정도 같이 열린다(design-decisions-log.md 참고).

#### Digest 추출 결과 없음

- **Given**: 유저가 제출한 Source의 Digest 추출이 진행 중이다.
- **When**: 추출이 완료됐는데 추출된 Digest 후보가 하나도 없다.
- **Then**:
  1. ingestion changeset이 생성되지 않는다.
  2. 그 Source는 평범한 대기 상태로 돌아가고, 추출할 내용을 찾지 못했다는 안내가 표시된다.
  3. Digest 추출 실행 액션으로 다시 시도할 수 있다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-12, PR #385)**: ingestion changeset 미생성(Then #1)과 "결과없음" 배지 표시(Then #2 일부)는 구현됨. 재시도 액션(Then #3)은 2차 슬라이스로 미룸 — 그래서 미체크로 남김.
- **범위 참고 (2026-07-13, PR #394)**: 위 노트가 가리키던 2차 슬라이스(취소·삭제·수동 추출 실행)가 반영됐지만, 재시도 액션은 cancelled 상태의 "수동 추출 실행"으로만 부분 커버되고(케이스 "초안에서 Digest 추출 실행" 참고) empty 상태에서의 재시도(Then #3)는 여전히 범위 밖 — 그래서 계속 미체크로 남김.
- **확정 (2026-07-14)**: `FOOTER_BY_STATUS`에서 empty도 `DraftIdleActions`를 풋터로 쓰도록 연결 — Then #3(재시도 액션)까지 구현됨. cancelled와 동일한 컴포넌트라 재시도(추출 실행)뿐 아니라 삭제·Space 재지정도 같이 열린다(design-decisions-log.md 참고).

#### 결과없음 상태 정리 버튼 비활성화 (원문 수정 전까지)

- **Given**: 유저가 초안에서 empty(결과없음) 상태인 Source를 보고 있다.
- **When**: 원문을 수정하지 않은 채로 있다.
- **Then**: 정리(재시도) 액션이 비활성화된다.
- **관여 화면**: 초안
- **범위 참고**: `IdleDraftDetailPanel`의 `regenerateDisabled = (status === "empty" && !bodyDirty) || isRegenerating` — 원문이 실제로 바뀌기 전까진 정리를 막아 같은 결과없음이 반복되는 헛수고를 예방한다. failed·cancelled는 내용 문제가 아닐 수 있어 이 제약이 없다.

#### 버려진 리뷰 원문 상태 아이콘 미표시

- **Given**: 유저가 초안에서 discarded(리뷰를 버려서 평범한 대기로 돌아온) 상태인 Source를 보고 있다.
- **When**: 초안 목록에서 그 카드를 본다.
- **Then**: failed·empty와 달리 상태 아이콘이 표시되지 않는다(cancelled와 동일하게 취급 — 사람이 스스로 버린 정상 종료라 별도 경고가 필요 없다).
- **관여 화면**: 초안
- **범위 참고 (#428)**: `digestionOutcome`이 `processing/failed/cancelled/empty/discarded` 5개 값으로 분리되기 전에는 discarded가 empty로 잘못 분류돼 결과없음 아이콘이 잘못 뜨던 버그가 있었다(#428에서 수정). `IdleDraftCard.tsx`의 아이콘 분기가 `failed`·`empty`만 매칭해 discarded는 자연히 아이콘 없음으로 떨어진다.

#### 초안 목록 빈 상태

- **Given**: 유저가 초안 화면에 있다.
- **When**: 처리 대기 중인 Source가 하나도 없다.
- **Then**: 빈 상태 안내가 표시된다.
- **관여 화면**: 초안

#### LNB 초안 버튼 조건부 노출

- **Given**: 유저가 인증을 완료했다.
- **When**: 앱에 진입한다.
- **Then**: 초안에 처리 대기 중인 Source가 있으면 LNB에 초안 버튼이 나타나고, 없으면 나타나지 않는다.
- **관여 화면**: LNB
- **확정 (2026-07-12, PR #385)**: `DraftsNavItem`에서 처리 대기 개수 기반 조건부 렌더링으로 구현.

#### LNB 초안 버튼 상태 표시

- **Given**: 유저가 인증을 완료했고, 초안에 여러 상태의 Source가 섞여 있다.
- **When**: LNB를 본다.
- **Then**: 실패 상태가 하나라도 있으면 경고 아이콘이 최우선으로 뜨고, 없고 처리 중인 게 있으면 진행 표시가 뜬다. 대기 중인 초안 개수가 배지로 표시된다.
- **관여 화면**: LNB
- **범위 참고**: `DraftsNavItem`의 우선순위 — 실패 > 처리중 > (cancelled·empty·discarded는 표시 없음). 구성 비율이 아니라 가장 급한 상태 하나만 보여준다.
