# 넣기 플로우

> 사용자 입력 → Digest 추출 시작(ingestion 완료 전)까지를 다룬다. 후보 확정·리뷰·되돌리기는 [`review-flow.md`](review-flow.md) 몫.

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
  3. 추출이 진행되는 동안 그 원본이 "초안"에 진행 중 상태로 나타난다.
- **관여 화면**: Space 오버뷰, 초안
- **확정 (2026-07-12, PR #385)**: Space 오버뷰 인라인 컴포저(`ChatInput` 재사용)로 구현. staging API + 실계정 라이브 검증 완료(`design-decisions-log.md` 참고).

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
- [x] 초안에서 Space 재지정
- [x] 처리 중 상태에서 액션 잠금 (2026-07-14, Kyle 실동작 확인 완료)
- [x] 초안에서 Source 제목 편집 (2026-07-14, Kyle 실동작 확인 완료 — 재추출 후 편집값 유지 회귀 확인 포함)
- [ ] 초안에서 이전 리뷰 보기 (의도적 보류 — review 1차의 Digest 리뷰 화면 랜딩 후 착수)
- [x] Digest 추출 실패
- [x] Digest 추출 결과 없음
- [x] LNB 초안 버튼 조건부 노출

### 케이스 상세

#### 처리 중 취소

- **Given**: 유저가 초안에서 Digest 추출이 진행 중인 Source를 보고 있다.
- **When**: 취소 액션을 실행한다.
- **Then**:
  1. 진행 중이던 Digest 추출이 멈춘다.
  2. 평범한 대기 상태로 돌아간다.
  3. Space 셀렉트, Digest 추출 실행, 삭제 액션이 다시 열린다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-13, PR #394)**: Then #1·#2와 Then #3의 "Digest 추출 실행·삭제 액션이 다시 열린다"는 구현·검증됨 — DB `cancel_source_digestion`(재클레임 불가능한 `cancelled` 상태로 전환) + 인메모리 `AbortController`로 떠 있는 LLM 콜 중단(`digestion-cancellation.test.ts`, `digestion.test.ts`의 취소 테스트 5종, `source-service.test.ts`로 코드 레벨 검증, 실 동작 검증은 아직 없음).
- **확정 (2026-07-13, PR #399)**: Then #3의 "Space 셀렉트가 다시 열린다"도 "초안에서 Space 재지정" 슬라이스 랜딩으로 구현됨 — cancelled 상태는 `DraftIdleActions`를 풋터로 쓰고, 여기 Space 셀렉트가 포함된다. 세 액션 모두 확인됐으므로 체크.

#### 초안에서 Digest 추출 실행

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있다.
- **When**: Digest 추출 실행 액션을 실행한다.
- **Then**: Digest 추출이 시작되고, 그 원본이 진행 중 상태로 전환된다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-13, PR #394)**: cancelled(취소 뒤 평범한 대기) 상태에서만 이 액션이 연결됨(`DraftCard.tsx`의 `FOOTER_BY_STATUS`). failed/empty는 "초안에서 Source 삭제"와 같은 이유로 2차 슬라이스 범위 밖(design-decisions-log.md 참고) — 그래서 미체크로 남김.

#### 초안에서 Source 삭제

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있다.
- **When**: 삭제 액션을 실행한다.
- **Then**:
  1. 그 Source가 즉시 삭제되고 초안 목록에서 제거된다.
  2. 휴지통·보관 기간 없이 완전히 삭제된다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-13, PR #394)**: 삭제 액션은 이번 슬라이스에서 cancelled(취소 뒤 평범한 대기) 상태에만 연결됨. failed/empty는 재시도 액션과 마찬가지로 2차 슬라이스 몫(design-decisions-log.md 참고) — 그래서 이 케이스도 아직 미체크로 남김.

#### 초안에서 Space 재지정

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있다.
- **When**: Space 셀렉트 액션을 실행해 다른 Space를 선택한다.
- **Then**: 그 Source가 선택한 Space로 즉시 재지정된다.
- **관여 화면**: 초안
- **확정 (2026-07-13, PR #399)**: `reassign_source_space` RPC(원본 Space·대상 Space 양쪽 멤버십 체크 — 대상 Space 접근권 없음은 `42501`, 상태 가드 실패·확정 대기 리뷰 있음은 `NM004`로 리뷰 반영 후 분리, `source-service.test.ts`)와 `DraftIdleActions`의 Space 셀렉트(`space.list` + `useReassignSourceSpace`, 선택 즉시 반영)로 구현. failed/empty는 다른 초안 액션과 같은 이유로 범위 밖(cancelled만 연결) — design-decisions-log.md 참고.

#### 처리 중 상태에서 액션 잠금

- **Given**: 유저가 인증을 완료했고, 초안에 Digest 추출이 진행 중인 Source가 있다.
- **When**: 초안에 진입한다.
- **Then**: 그 Source 카드는 Space 셀렉트·Digest 추출 실행·삭제·제목 편집이 모두 비활성화되고, 처리 중이라 그렇다는 이유가 함께 표시된다. 취소 액션만 남는다.
- **관여 화면**: 초안
- **범위 참고 (2026-07-13, PR #394)**: Digest 추출 실행·삭제 버튼이 처리 중엔 아예 안 보이고(카드 풋터가 `DraftProcessingActions`로 교체), Lock 아이콘 + 잠금 사유 캡션(`intake.draft_locked_reason`) + 취소 버튼만 남는 것은 구현·검증됨. Space 셀렉트·제목 편집은 기능 자체가 아직 없어(각각 별도 미체크 케이스) "비활성화"를 검증할 대상이 없다 — 이 둘을 위한 개별 disabled 버튼 대신 공용 캡션 하나로 잠금 사유를 뭉쳐 전달하는 현재 방식이 두 기능이 실제로 생겼을 때도 맞는 표현인지는 PM 확인 필요(design-decisions-log.md 2026-07-13 참고).
- **범위 참고 (2026-07-13, PR #399)**: "초안에서 Space 재지정" 슬라이스 랜딩으로 Space 셀렉트가 실제 버튼이 됐다 — 위 PM 확인 대상이던 질문에 대한 답: 캡션은 특정 액션 이름을 나열하지 않는 일반 문구(`intake.draft_locked_reason`, "처리 중엔 편집할 수 없어요")라 액션이 몇 개든 그대로 맞는다(내 판단, design-decisions-log.md 참고). Space 셀렉트 잠금(processing 상태에선 `DraftIdleActions` 자체가 안 그려짐)은 이걸로 검증됨 — 다만 제목 편집은 여전히 기능 자체가 없어(케이스 "초안에서 Source 제목 편집" 참고) Then절 전체("Space 셀렉트·Digest 추출 실행·삭제·제목 편집이 모두 비활성화")를 검증할 수 없다 — 그래서 계속 미체크로 남김.
- **범위 참고 (제목편집 슬라이스)**: 제목 편집 액션(펜슬 버튼)도 Extract/Delete와 같은 패턴으로 처리 중엔 렌더링 자체가 안 된다(`DraftCard`의 `canEditTitle = status !== "processing"`, 별도 disabled 버튼 없음). Space 셀렉트 잠금과 합쳐 Then절의 네 액션(Space 셀렉트·Digest 추출 실행·삭제·제목 편집) 모두 코드 레벨로는 확인됐다.
- **확정 (2026-07-14)**: Kyle이 staging에서 처리 중 카드에 네 액션 다 안 보이고 잠금 캡션+취소만 남는 것을 실동작으로 확인.

#### 초안에서 Source 제목 편집

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있다.
- **When**: 제목 편집 액션을 실행하고 새 제목을 입력한다.
- **Then**: 그 Source의 제목이 즉시 반영된다.
- **관여 화면**: 초안
- **범위 참고**: cancelled·failed·empty 셋 다 "평범한 대기 상태"라 전부 편집 가능(Extract/Delete와 달리 failed/empty를 좁힐 이유가 없다 — BE 가드도 `digestion_status<>'pending'` 전체를 허용). 다이얼로그(`EditSourceTitleDialog`) 저장 시 `source.updateTitle` 뮤테이션 성공 후 `listPending` 쿼리를 invalidate해 반영 — 코드 레벨(typecheck/lint/test)로 확인됨.
- **확정 (2026-07-14)**: Kyle이 staging에서 제목 편집 즉시 반영 + 재추출 후 편집값 유지(회귀 방지 확인 포함)를 실동작으로 확인.
- **범위 참고 (2026-07-13, 리뷰 반영)**: "즉시 반영된다"는 그 한 번의 편집에 한정 — 이후 같은 Source에서 "초안에서 Digest 추출 실행"(재시도)이 다시 돌면, 워커가 새로 뽑은 제목이 방금 편집한 값을 덮어쓰지 않는다(`sources.title_edited` 플래그, `update_source_title`이 세우고 `complete_source_digestion`/`create_ingestion_review`가 확인). 리뷰에서 발견된 무음 데이터 유실을 막기 위한 후속 수정.

#### 초안에서 이전 리뷰 보기

- **Given**: 유저가 초안에서 평범한 대기 상태인 Source를 보고 있고, 그 Source에 버려진(discarded) changeset 또는 되돌려진(revert) changeset이 있다.
- **When**: 이전 리뷰 보기 액션을 실행한다.
- **Then**: discarded 유래면 그 changeset의 상세로 이동해 되살릴 수 있고, revert 유래면 최신 revert changeset의 상세로 이동해 되돌리기(재적용)를 할 수 있다(구체적 동작은 review-flow.md 몫).
- **관여 화면**: 초안

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

#### LNB 초안 버튼 조건부 노출

- **Given**: 유저가 인증을 완료했다.
- **When**: 앱에 진입한다.
- **Then**: 초안에 처리 대기 중인 Source가 있으면 LNB에 초안 버튼이 나타나고, 없으면 나타나지 않는다.
- **관여 화면**: LNB
- **확정 (2026-07-12, PR #385)**: `DraftsNavItem`에서 처리 대기 개수 기반 조건부 렌더링으로 구현.
