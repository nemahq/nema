# 리뷰·후처리 플로우

> 4개 changeset 타입(ingestion/relation/manual/revert) 전체의 리뷰·확정·버리기·되돌리기·되살리기를 다룬다. Digest 추출이 끝나 후보가 생성된 시점부터 시작.

### 함께 보는 문서

- [기능 명세서 인덱스](README.md)
- [넣기 플로우](intake-flow.md)
- 표면 인벤토리(`../surface-inventory.md`): Digest 상세, Digest 리뷰 화면, 변경셋, Changeset 상세, 초안

### 시나리오

## Ingestion 리뷰

### 케이스 목록

- [x] Digest 추출 완료 → ingestion changeset 자동 생성
- [x] 검토 대기 배지 실시간 갱신 (LNB·Space 오버뷰)
- [x] Digest 리뷰 화면 진입
- [x] 원문에 없는 필드는 비워둠
- [x] Digest 타입 제안
- [x] 신규 Topic·Tag 제안
- [ ] 기존 Topic·Tag 재사용 제안
- [ ] 기존 Topic·Tag는 이름 수정 불가
- [x] 신규 Topic·Tag 이름 수정 가능
- [ ] Digest 리뷰 화면에서 Topic·Tag 추가 — 기존 선택
- [x] Digest 리뷰 화면에서 Topic·Tag 추가 — 신규 생성
- [ ] Reference 후보 자동 제안 및 매칭
- [x] Changeset 제목 자동 생성 (ingestion)
- [x] Digest 후보 삭제
- [x] Digest 리뷰 확정
- [x] Digest 리뷰 버리기
- [x] 적용된 리뷰 되돌리기
- [ ] Changeset 제목 자동 생성 (revert)
- [ ] 원문도 삭제하기
- [ ] 버려진 리뷰 되살리기
- [ ] 원문 삭제 후 되살리기 비활성화
- [ ] 신규 Reference 후보 편집
- [ ] 기존 Reference 후보 병합 편집
- [ ] 타입 변경 시 필드 초기화
- [ ] 원문 대조 포커스 전환
- [ ] Digest 리뷰 화면에서 외부 링크 추가
- [ ] Digest 리뷰 화면에서 외부 링크 수정
- [ ] Digest 리뷰 화면에서 외부 링크 삭제
- [ ] Digest 리뷰 화면에서 @ 멘션 — 기존 Reference 선택
- [ ] Digest 리뷰 화면에서 @ 멘션 — 새 Reference 생성
- [ ] 엔진 제안 대비 교정 신호 기록
- [ ] Digest 후보 외부 AI 도구 공개 여부 설정
- [ ] 모든 후보 삭제 시 확정 비활성화
- [ ] 제목 없이 확정 비활성화

### 케이스 상세

#### Digest 추출 완료 → ingestion changeset 자동 생성

- **Given**: 유저가 제출한 Source의 Digest 추출이 진행 중이다.
- **When**: 추출이 완료되어 하나 이상의 Digest 후보와 Reference 후보가 나온다.
- **Then**:
  1. ingestion changeset이 open 상태로 자동 생성된다.
  2. 그 changeset은 변경셋 탭의 Open 목록과 Digest 리뷰 화면에서 확인할 수 있게 된다.
- **관여 화면**: 변경셋, Digest 리뷰 화면
- **확정 (2026-07-20, Kyle 실동작 확인)**: `digestSource`가 추출 완료 후 `create_ingestion_review` RPC를 호출해 changeset을 `status='open'`으로 생성한다(`apps/server/src/infra/statement-sync/digestion.ts`). 변경셋 탭(Open)과 Digest 리뷰 화면(`digestReview.get`) 모두 같은 `status='open'` 가드로 조회하므로 Then #1·#2가 구조적으로 보장됨. 코드 레벨 확인 후 Kyle이 실사용으로 확인해 체크.

#### 검토 대기 배지 실시간 갱신 (LNB·Space 오버뷰)

- **Given**: 유저가 LNB/Space 오버뷰를 보고 있다.
- **When**: ingestion changeset이 새로 열린다.
- **Then**: 새로고침 없이 LNB의 Space 목록 배지와 Space 오버뷰의 변경사항 탭 배지가 실시간으로 갱신된다.
- **관여 화면**: LNB, Space 오버뷰, 변경셋
- **범위 참고**: 두 배지 모두 `space.openChangesetCount` 하나를 공유(`SpaceListItem.tsx`/`SpaceTabButton.tsx`). Supabase Realtime 도입(PR #419)으로 실시간 갱신.

#### Digest 리뷰 화면 진입

- **Given**: 유저가 변경사항 리스트(Open)에서 ingestion changeset 행을 본다.
- **When**: 그 행을 클릭해 Digest 리뷰 화면에 진입한다.
- **Then**: 추출된 Digest 후보와 Reference 후보가 문서형 편집 카드로 나열된다.
- **관여 화면**: 변경셋, Digest 리뷰 화면
- **범위 참고**: 원문 위치 하이라이트 동기화는 별도 케이스 "원문 대조 포커스 전환"으로 이관 — 여기선 중복 검증하지 않는다.

#### 원문에 없는 필드는 비워둠

- **Given**: Digest 추출 결과, 특정 optional 필드에 해당하는 내용이 원문에 없다.
- **When**: Digest 리뷰 화면에서 그 후보를 본다.
- **Then**: 그 필드는 지어낸 내용 없이 빈 칸으로 제안된다.
- **관여 화면**: Digest 리뷰 화면
- **확정 (2026-07-20, Kyle 실동작 확인)**: 시스템 프롬프트("Fill only what the note says... never invent, never pad")와 `DigestBodySchema`의 optional 필드, `buildDigestBody`의 빈 값→undefined 정규화까지 3중으로 구조적 보장됨(`apps/server/src/prompts/digest-generation.ts`, `packages/shared/src/schemas/digest.ts`, `apps/server/src/infra/statement-sync/digestion.ts`).

#### Digest 타입 제안

- **Given**: Digest 추출이 진행 중이다.
- **When**: Digest 후보가 생성된다.
- **Then**: 엔진이 원문 내용을 분석해 5가지 타입(결정·미결·학습·아이디어·가정) 중 하나를 제안하고, 그 타입에 맞는 본문 필드 구조로 후보가 제시된다.
- **관여 화면**: Digest 리뷰 화면
- **확정 (2026-07-20, Kyle 실동작 확인)**: `DIGEST_TYPES`(결정·미결·학습·아이디어·가정 5종, `packages/shared/src/schemas/digest.ts`)와 타입별 프롬프트 지시, `buildDigestBody`의 판별 유니언 조립(타입 밖 필드 폐기)으로 타입에 맞는 필드 구조가 구조적으로 보장됨. 코드 레벨 확인 후 Kyle이 실사용으로 확인해 체크.

#### 신규 Topic·Tag 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이 Space/Workspace에 아직 없는 주제·태그에 해당한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 엔진이 새로 만든 Topic·Tag가 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 기존 재사용 라벨과 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면
- **확정 (2026-07-20, Kyle 실동작 확인)**: `digest-review-service.ts`의 `getReview`가 레지스트리에 매칭 안 되는 Topic·Tag를 `id: null`(신규)로 후보에 미리 채우고, 확정 시 `confirm_ingestion_review`가 find-or-create(`ON CONFLICT ... DO UPDATE`)로 실제 행을 만든다. 같은 후보 안에서 기존/신규 라벨이 배타적이지 않게 섞일 수 있는 구조. 코드 레벨 확인 후 Kyle이 실사용으로 확인해 체크.

#### 기존 Topic·Tag 재사용 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이미 존재하는 Topic·Tag와 일치한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 새로 만들지 않고 기존 Topic·Tag가 재사용되어 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 신규 라벨과 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-20, QA 세션)**: 이름이 일치하는 `status='active'` Topic·Tag는 `id`가 채워져 재사용되고, archived 항목은 재사용 후보에서 제외된다(`digest-review-service.ts`). 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

#### 기존 Topic·Tag는 이름 수정 불가

- **Given**: 유저가 Digest 리뷰 화면에서 기존 Topic·Tag가 재사용 제안된 후보를 보고 있다.
- **When**: 그 라벨의 이름을 수정하려 시도한다.
- **Then**: 이름은 읽기 전용이라 수정할 수 없다. 그 Digest에서 제거하는 것은 계속 가능하다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-15, PR #414)**: `EditableLabelChip`이 `id !== null`(레지스트리 매치)일 때 `readOnly`로 렌더링 — 스펙 그대로 구현·멀티 에이전트 코드 리뷰 + 서버/FE 테스트로 검증됨. 실동작 확인 아직 안 됨.

#### 신규 Topic·Tag 이름 수정 가능

- **Given**: 유저가 Digest 리뷰 화면에서 신규로 제안된 Topic·Tag가 있는 후보를 보고 있다.
- **When**: 그 라벨의 이름을 수정한다.
- **Then**: 아직 서버에 존재하지 않는 임시 상태이므로, 수정한 이름이 이 changeset의 편집 중인 내용에 즉시 반영된다.
- **관여 화면**: Digest 리뷰 화면

- **확정 (2026-07-20, Kyle 실동작 확인)**: `id === null`일 때 인라인 `<input>`으로 편집 가능, `DigestReviewScreen`의 `topicsOverrides`/`tagsOverrides`(기존 `titleOverrides`와 동일 패턴)로 즉시 반영. 빈 값으로 지운 채 확정을 시도하면(리뷰에서 발견된 회귀) 확정 버튼이 비활성화되도록 수정 완료.

#### Digest 리뷰 화면에서 Topic·Tag 추가 — 기존 선택

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Topic·Tag 추가 액션을 실행해 검색하고, 일치하는 기존 라벨을 선택한다.
- **Then**: 그 기존 라벨이 이 changeset의 편집 중인 내용에 즉시 추가된다. 새 라벨은 생성되지 않는다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-15, PR #414)**: `TopicAddPopover`/`TagAddPopover`의 검색·선택 구현됨. 리뷰에서 `topic.list`가 Space 스코프 없이 다른 Space의 동명 Topic까지 "기존"으로 노출하던 크로스-Space 버그를 발견해 `spaceId` 파라미터 추가로 수정 — Tag는 원래 Workspace 스코프라 해당 없음. 실동작 확인 아직 안 됨.

#### Digest 리뷰 화면에서 Topic·Tag 추가 — 신규 생성

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Topic·Tag 추가 액션을 실행해 검색했지만 일치하는 라벨이 없어, 새로 만들기를 선택한다.
- **Then**: Topic은 검색어를 이름으로 하는 새 라벨이 즉시 추가된다. Tag는 이름(검색어 프리필)+설명 2필드 미니 폼을 거쳐야 추가된다(`description`이 필수 필드라서).
- **관여 화면**: Digest 리뷰 화면
- **확정 (2026-07-20, Kyle 실동작 확인)**: Tag가 Topic과 다르게 description 필수라 미니 폼을 거치는 것까지 확인(`design-decisions-log.md` 2026-07-15 항목 참고).

#### Reference 후보 자동 제안 및 매칭

- **Given**: Digest 추출이 진행 중이고, 원문에 사람·조직·프로젝트·제품·개념으로 분류할 만한 대상이 언급되어 있다.
- **When**: Digest 후보가 생성된다.
- **Then**: 그 대상이 레지스트리에 이미 있으면 기존 Reference 후보로, 없으면 신규 Reference 후보로 분류되어 함께 제안된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-20, QA 세션)**: `digest-generation.ts` 프롬프트가 사람·조직·프로젝트·제품·개념(person/organization/project/product/term) 분류와 레지스트리 매칭 여부에 따른 기존/신규 분기를 명시적으로 지시한다. 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

#### Changeset 제목 자동 생성 (ingestion)

- **Given**: Digest 추출이 완료되어 하나 이상의 Digest 후보가 나왔다.
- **When**: ingestion changeset이 생성된다.
- **Then**: 그 changeset의 제목은 Source의 제목을 그대로 사용한다. Source 제목이 별도의 nano LLM 콜(`fill_source_title`)로 아직 안 채워졌으면 changeset 제목도 null로 시작했다가, 나중에 채워지면 트리거로 갱신된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (PR #435)**: `create_ingestion_review`가 그 시점 Source 제목을 복사, `sources.title` 변경 시 연결된 ingestion changeset title로 전파하는 트리거로 갱신 유지.

#### Digest 후보 삭제

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보 카드들을 보고 있다.
- **When**: 후보 하나의 삭제 액션을 실행한다.
- **Then**: 컨펌 모달 없이 그 후보가 즉시 이 changeset의 편집 중인 내용에서 제거된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-14, PR #412)**: `onRemove`로 컨펌 없이 즉시 로컬 상태(`removedDigestIndexes`)에서 제거. Reference 후보 삭제도 같은 방식으로 함께 구현됨(별도 케이스 없음, 이 케이스가 겸함).

#### Digest 리뷰 확정

- **Given**: 유저가 Digest 리뷰 화면에서 하나 이상의 Digest 후보를 보고 있다.
- **When**: 확정 액션을 실행한다.
- **Then**:
  1. 이 changeset이 closed+applied 상태로 전환된다.
  2. 남은 Digest·Reference 후보가 모두 확정되어 활성 상태가 된다.
  3. 진술·관계 생성이 시작된다.
  4. 리뷰 화면(open 전용)은 유효하지 않게 되므로, 처리 결과의 정본 위치인 변경사항 상세로 곧바로 이동한다.
- **관여 화면**: Digest 리뷰 화면, Changeset 상세
- **범위 참고 (2026-07-14, PR #412)**: Then #1은 이 PR이 구현(`useConfirmReview`). Then #2·#3(후보 확정·진술/관계 생성)은 기존 `confirm_ingestion_review` RPC가 이미 담당하던 부분이라 이 PR에서 변경 없음.
- **갱신 (2026-07-18)**: Then #4를 뒤집었다 — 처음엔 "화면 안 이동, 로컬 `outcome`으로 배지만 갱신"이었는데, changeset이 실제 closed로 전이하면 open 전용 `digestReview.get`이 재조회 불가라 정본 위치가 구조적으로 변경사항 상세(`ClosedReviewScreen`)다. 확정 성공 즉시 그리로 자동 이동하도록 바꿨다(design-decisions-log.md 2026-07-18 항목 참고). `OpenReviewScreen.tsx`의 `goToClosedReview()`(확정 성공 콜백에서 호출)로 구현.

#### Digest 리뷰 버리기

- **Given**: 유저가 Digest 리뷰 화면에서 하나 이상의 Digest 후보를 보고 있다.
- **When**: 버리기 액션을 실행한다.
- **Then**:
  1. 이 changeset이 closed+discarded 상태로 전환된다.
  2. Digest·Reference가 아무것도 생성되지 않는다.
  3. Source는 초안(pending)으로 돌아간다.
  4. 리뷰 화면(open 전용)은 유효하지 않게 되므로, 처리 결과의 정본 위치인 변경사항 상세로 곧바로 이동한다.
- **관여 화면**: Digest 리뷰 화면, Changeset 상세
- **범위 참고 (2026-07-14, PR #412)**: 신설된 `discard_ingestion_review` RPC(가드: `type='ingestion' AND status='open'`, changes 미생성)와 `useDiscardReview`로 Then #1~#3 구현.
- **갱신 (2026-07-18)**: Then #4를 확정과 같은 이유로 뒤집어 자동 이동으로 바꿨다(위 "Digest 리뷰 확정" 갱신·design-decisions-log.md 2026-07-18 항목 참고). `useDiscardReview`의 `onSuccess` 콜백에서 `goToClosedReview()` 호출로 구현.

#### 적용된 리뷰 되돌리기

- **Given**: 유저가 Changeset 상세에서 적용된 상태인 changeset을 보고 있다(Digest 리뷰 화면은 open 전용이라 여기 해당 없음 — `digestReview.get` RPC 가드가 `status='open'`만 허용).
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 컨펌 다이얼로그 없이 즉시 실행된다.
  2. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  3. 이 changeset이 만든 Digest들이 archive되고, Source는 초안(pending)으로 돌아간다.
  4. 성공 시 새로 생성된 revert changeset의 상세로 자동 이동한다.
- **관여 화면**: Changeset 상세
- **범위 참고 (2026-07-14, PR #412; 갱신 PR #438)**: `useRevertChangeset`이 `revert_changeset` RPC를 호출, 응답의 `revertChangesetNumber`로 `ClosedReviewScreen.tsx`가 즉시 navigate.

#### Changeset 제목 자동 생성 (revert)

- **Given**: 유저가 적용된 changeset을 되돌린다(이미 되돌려진 changeset을 다시 되돌리는 체이닝 포함).
- **When**: 되돌리기(revert) changeset이 생성된다.
- **Then**: 제목이 원본 제목 + "되돌려짐" 여부를 UI 언어에 맞는 자연스러운 표현으로 보여준다(반복 접미사를 그대로 이어붙이지 않음). 원본 제목이 없으면(번호 자리표시자 폴백 중) 이 되돌리기도 같은 폴백을 물려받는다.
- **관여 화면**: Changeset 상세, 변경셋
- **범위 참고**: 저장은 원본 제목+되돌려진 횟수(depth)로, 표시는 클라이언트가 UI 언어별 자연스러운 문구(Tolgee ICU 복수형 키)로 조합해야 함. 현재 구현(`revert_changeset` RPC)은 SQL에서 `title || ' 되돌림'`으로 한국어 문자열을 직접 이어붙여 저장 — 영어 UI에서 한/영 혼재되는 버그, 수정 필요.

#### 원문도 삭제하기

- **Given**: 유저가 Changeset 상세에서 버려지거나 되돌려진 changeset을 보고 있다(Digest 리뷰 화면은 open 전용이라 여기 해당 없음).
- **When**: 원문도 삭제하기 액션을 실행한다.
- **Then**:
  1. 그 원문이 즉시 trashed 상태로 전환된다.
  2. 원문도 삭제하기 액션이 사라진다.
- **관여 화면**: Changeset 상세
- **범위 참고 (2026-07-14, PR #412)**: `useTrashReviewSource`(기존 `trash_source` RPC 재사용)로 구현 — 확인 다이얼로그 → 즉시 trashed 전환 → 액션 비활성화.

#### 버려진 리뷰 되살리기

- **Given**: 유저가 Digest 리뷰 화면에서 버려진 상태인 changeset을 보고 있다.
- **When**: 되살리기 액션을 실행한다.
- **Then**:
  1. 이 changeset의 상태가 open으로 되돌아간다.
  2. 버리기 직전의 편집 상태(삭제했던 후보 등)가 그대로 복원된다.
  3. 변경셋 탭에서도 이 changeset이 Closed에서 Open으로 옮겨간다.
- **관여 화면**: Digest 리뷰 화면, 변경셋
- **범위 참고 (2026-07-14, PR #412)**: 화면 배치가 이 케이스의 Given과 다르다(위 두 케이스와 같은 이유) — 되살리기 액션은 Changeset 상세에만 뒀다(`useRestoreReview` + 신설 `restore_ingestion_review` RPC). Then #1·#3은 구현. Then #2("버리기 직전의 편집 상태가 복원된다")는 구조적으로 불가능 — `discard_ingestion_review`가 changes를 아예 안 만드는 방식이라(변경이력 없음, 마이그레이션 주석 참고) 서버에 복원할 "편집 중이던 상태" 자체가 없다. `restore_ingestion_review`는 changeset.status만 되돌릴 뿐, 후보 삭제·제목 수정 같은 로컬 편집 내용은 애초에 저장된 적이 없어 복원 대상이 아니다 — 되살리면 원래(추출 직후) 상태의 Digest 리뷰 화면으로 돌아간다. 이 케이스의 Then #2는 스펙과 실제 구현이 근본적으로 다른 지점이라 PM 확인 필요(design-decisions-log.md 참고). 그래서 미체크로 남김.

#### 원문 삭제 후 되살리기 비활성화

- **Given**: 유저가 Digest 리뷰 화면에서 버려진 changeset의 원문도 삭제하기를 실행해, 그 원문이 trashed 상태가 되었다.
- **When**: Digest 리뷰 화면에 진입한다.
- **Then**: 되살리기 액션이 비활성화된 채로 남아 있고, 원문이 삭제되어 되살릴 수 없다는 이유가 함께 표시된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-14, PR #412)**: 화면 배치가 이 케이스의 Given과 다르다(위 세 케이스와 같은 이유) — 비활성화·이유 표시는 Changeset 상세에서 구현됨(`restoreBlocked`). 리뷰에서 발견된 두 번째 케이스(원문이 trashed가 아니라 그 사이 다른 경로로 재인제스천되어 active가 된 경우)도 별도 이유 문구로 함께 처리하도록 리뷰 반영 후 보강함. 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

#### 신규 Reference 후보 편집

- **Given**: 유저가 Digest 리뷰 화면에서 레지스트리에 매칭되지 않은 신규 Reference 후보를 보고 있다.
- **When**: 타입·이름·설명을 수정한다.
- **Then**: 수정한 내용이 이 changeset의 편집 중인 내용에 즉시 반영된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-15, PR #416)**: `ReferenceCandidateCard`의 타입 Select·이름 Input·설명 textarea가 `referenceOverrides`(키별 즉시 반영)로 구현됨 — 코드 리뷰 + `confirmReviewFlow.test.ts`(원본과 다른 값으로 trim 검증)로 확인. 길이 상한(`maxLength`)도 멀티 에이전트 리뷰에서 반영. 실측 브라우저 확인은 PM이 별도 진행 예정이라 체크는 보류.

#### 기존 Reference 후보 병합 편집

- **Given**: 유저가 Digest 리뷰 화면에서 레지스트리에 매칭된 기존 Reference 후보를 보고 있다.
- **When**: 엔진이 제안한 병합 설명을 수정한다.
- **Then**: 수정한 내용이 이 changeset의 편집 중인 내용에 즉시 반영된다. 타입·이름은 읽기 전용으로 유지되어 수정할 수 없다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-15, PR #416)**: `ReferenceMergeCard`로 구현 — 타입·이름 읽기 전용, "바뀔 설명"(mergeNote)만 편집 가능, `mergeNoteOverrides`로 즉시 반영. 리뷰에서 "제안을 거부할 방법도 원본을 볼 방법도 없다"는 지적이 나와, 원본 body를 읽기 전용으로 나란히 노출 + "원래대로" 버튼(mergeNote를 원본으로 되돌려 병합을 no-op으로 만듦)을 추가로 반영했다 — 순수 함수(`referenceMerge.ts`)로 추출해 테스트로 고정(null/non-null 혼합, 인용 사라진 후보 제외, override, "원래대로" 각각). 삭제/추가(취소선·밑줄) 형태의 diff 표시는 여전히 스코프 밖(`design-decisions-log.md` 참고) — 원본은 보이지만 시각적 대조는 후속. 실측 브라우저 확인은 PM이 별도 진행 예정이라 체크는 보류.

#### 타입 변경 시 필드 초기화

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: 그 후보의 타입을 다른 타입으로 변경한다.
- **Then**: 컨펌 모달 없이 기존 타입 전용 필드 내용이 즉시 초기화되고 새 타입의 필드로 전환된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-15, PR #416)**: `DigestCandidateCard`의 타입 Select `onValueChange`가 `onBodyChange({ type })`(이전 타입 필드 없이 새 타입만)를 호출 — 컨펌 모달 없이 즉시 전환되는 스펙 그대로 구현. `DigestBodySchema`가 타입별 필드를 전부 optional로 둬 스키마 레벨 안전망은 있으나, 이 리셋 생성 자체(타입 Select 핸들러)를 직접 검증하는 테스트는 아직 없음(`confirmReviewFlow.test.ts`는 override 값이 주어졌을 때 잘 흘러가는지만 검증) — 멀티 에이전트 리뷰에서 지적됐고 이번 라운드엔 미반영. 코드 레벨 확인만 됐고 실측·전용 테스트 둘 다 없어 미체크로 남김.

#### 원문 대조 포커스 전환

- **Given**: 유저가 Digest 리뷰 화면에서 여러 후보 카드를 보고 있다.
- **When**: 특정 카드의 원문에서 보기 액션을 실행한다.
- **Then**:
  1. 원문 탭의 하이라이트가 그 카드가 나온 위치로 갱신된다.
  2. 지금 원문 탭과 연결된 카드가 어느 것인지 다른 카드와 구분되어 보인다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 외부 링크 추가

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: 외부 링크 추가 액션을 실행하고 URL을 입력한다.
- **Then**: 그 링크가 이 changeset의 편집 중인 내용에 즉시 추가된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 외부 링크 수정

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있고, 외부 링크가 하나 이상 있다.
- **When**: 그중 하나의 URL을 수정하는 액션을 실행한다.
- **Then**: 그 링크가 수정한 URL로 이 changeset의 편집 중인 내용에 즉시 반영된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 외부 링크 삭제

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있고, 외부 링크가 하나 이상 있다.
- **When**: 그중 하나의 삭제 액션을 실행한다.
- **Then**: 그 링크가 이 changeset의 편집 중인 내용에서 즉시 제거된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 @ 멘션 — 기존 Reference 선택

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보의 본문을 편집하고 있다.
- **When**: 본문 필드에서 @ 멘션 액션을 실행해 검색하고, 일치하는 기존 Reference를 선택한다.
- **Then**: 그 Reference를 가리키는 멘션이 편집 중인 본문에 즉시 삽입된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 @ 멘션 — 새 Reference 생성

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보의 본문을 편집하고 있다.
- **When**: 본문 필드에서 @ 멘션 액션을 실행해 검색했지만 일치하는 Reference가 없어, 새로 만들기를 선택한다.
- **Then**:
  1. 검색어를 이름으로 하는 새 Reference 후보가 Reference 후보 목록 끝에 추가되고, 그 사실이 인터럽트 없는 가벼운 신호로 드러난다(예: 목록 라벨의 개수 변화).
  2. 포커스는 이동하지 않고, 편집 중이던 본문에 그 Reference를 가리키는 멘션이 즉시 삽입된다.
  3. 새 Reference 후보의 타입·설명은 비어있는 채로 남고, "신규 Reference 후보 편집" 케이스를 통해 별도로 채울 수 있다.
- **관여 화면**: Digest 리뷰 화면

#### 엔진 제안 대비 교정 신호 기록

- **Given**: Digest 후보에 엔진이 제안한 Topic·Tag·Reference 매칭이 하나 이상 있다.
- **When**: 유저가 확정하기 전에 그 제안을 그대로 두거나, 제거하거나, 새로 추가하거나, 다른 것으로 바꾼다.
- **Then**:
  1. 제안을 그대로 두고 확정하면 동의로 기록된다.
  2. 제안을 제거하거나 다른 것으로 바꾸면 반박(review_correction)으로 기록된다.
  3. 엔진이 제안하지 않은 걸 새로 추가하면 누락(review_correction)으로 기록된다.
  4. 이 신호는 화면에 노출되지 않고, 추후 제안 품질 개선을 위해 내부에 축적된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 후보 외부 AI 도구 공개 여부 설정

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: 외부 AI 도구 공개 체크를 끈다(기본값은 켜짐).
- **Then**:
  1. 이 설정이 changeset의 편집 중인 내용에 즉시 반영된다.
  2. 확정되면 이 Digest에서 파생되는 진술도 같은 설정을 상속한다. 이 진술이 다른 진술과 맺는 관계는 양쪽 중 하나라도 외부 AI 도구 공개가 꺼져 있으면 마찬가지로 꺼진 것으로 취급된다.
  3. 이 설정은 Nema 웹앱 자체의 열람·검색에는 영향을 주지 않는다. 외부 AI 도구 공개가 꺼진 콘텐츠는 MCP로 연결된 외부 AI 클라이언트의 조회 결과에만 전혀 포함되지 않는다(존재 힌트 없이 완전 제외).
- **관여 화면**: Digest 리뷰 화면

#### 모든 후보 삭제 시 확정 비활성화

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보와 Reference 후보를 딱 하나만 남기고 나머지를 모두 삭제한 상태다.
- **When**: 그 마지막 남은 후보를 삭제한다.
- **Then**: 확정 액션이 비활성화되고, 후보가 하나도 없어 확정할 게 없다는 이유가 함께 표시된다. 버리기 액션은 계속 사용할 수 있다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-14, PR #412)**: 구현됨 — `confirmDisabledReason`(순수 함수로 추출, 유닛 테스트 있음)이 `hasCandidates`를 최우선으로 판정. 버리기 액션은 이 비활성화와 무관하게 항상 사용 가능. 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

#### 제목 없이 확정 비활성화

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보의 제목을 입력한 상태다.
- **When**: 그 제목을 모두 지운다.
- **Then**: 확정 액션이 비활성화되고, 제목이 필요하다는 이유가 함께 표시된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-14, PR #412)**: 구현됨 — "제목"은 Changeset 제목이 아니라 Digest 후보 자체의 제목(`DigestCandidateCard`의 `Input`, `Changeset.title` 컬럼은 이번 PR 스코프 밖). `confirmDisabledReason`이 `hasEmptyTitle`을 판정. 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

## 실행취소

### 케이스 목록

- [ ] 실행취소
- [ ] 다시 실행
- [ ] 새로고침 후 최신 저장 상태 유지

### 케이스 상세

#### 실행취소

- **Given**: 유저가 Digest 리뷰 화면에서 실행취소 가능한 액션을 하나 이상 실행했다.
- **When**: 실행취소 액션을 실행한다.
- **Then**: 가장 최근 액션부터 순서대로 하나씩 되돌려진다. 이 실행취소 기록은 세션 스코프라 새로고침하면 사라진다.
- **관여 화면**: Digest 리뷰 화면

#### 다시 실행

- **Given**: 유저가 방금 실행취소를 실행했다.
- **When**: 다시 실행 액션을 실행한다.
- **Then**: 실행취소했던 액션이 다시 적용된다.
- **관여 화면**: Digest 리뷰 화면

#### 새로고침 후 최신 저장 상태 유지

- **Given**: 유저가 Digest 리뷰 화면에서 여러 편집을 했다.
- **When**: 화면을 새로고침한다.
- **Then**: 마지막으로 반영된 편집 상태가 그대로 유지된다. 다만 실행취소로 되돌아갈 수 있는 기록은 사라진다.
- **관여 화면**: Digest 리뷰 화면

## 관계 판정

### 케이스 목록

- [ ] 확신 관계 자동 적용
- [ ] 관련 Digest 자동 채움
- [ ] 관계 archive 시 관련 Digest 목록 표시 규칙
- [ ] 관련 Reference 자동 제안
- [ ] 판정 대기 relation changeset 생성
- [ ] Changeset 제목 자동 생성 (relation - 충돌)
- [ ] Changeset 제목 자동 생성 (relation - 중복)
- [ ] 재제안 가드
- [ ] 판정 모드 진입
- [ ] 충돌 판정 — 승자 선택
- [ ] 중복 판정 — 병합
- [ ] 판정 대기 relation changeset 버리기
- [ ] 버려진 relation changeset 되살리기
- [ ] 충돌 판정 되돌리기
- [ ] 중복 판정 되돌리기
- [ ] 확신 관계 자동 적용 되돌리기
- [ ] Changeset 상세 — 삭제된 원문의 스냅샷 콘텐츠 치환

### 케이스 상세

#### 확신 관계 자동 적용

- **Given**: 새 진술이 기존 진술들과 대조되었고, 관계 판정 결과 확신도가 높고 충돌·중복이 아니다.
- **When**: 관계 엔진이 그 배치를 처리한다.
- **Then**: relation changeset이 즉시 closed+applied 상태로 생성되어 조용히 적용된다. 사람의 판정 없이 변경셋 탭의 Closed 목록에서만 확인할 수 있다.
- **관여 화면**: 변경셋

#### 관련 Digest 자동 채움

- **Given**: Digest가 확정된 후 진술·관계 생성이 완료되었고, 그 Digest의 진술이 다른 Digest의 진술과 active 상태의 관계로 연결되었다(확신 관계로 자동 적용됐거나, 사람이 판정해 적용한 경우 모두 포함).
- **When**: 그 관계가 active 상태가 된다.
- **Then**: 두 Digest 모두의 상세에 서로가 관련 Digest로 자동 채워진다(양방향). 판정·확신 관계로만 채워지는 읽기 전용 목록이라 사람이 직접 추가·제거할 수 없다.
- **관여 화면**: Digest 상세

#### 관계 archive 시 관련 Digest 목록 표시 규칙

- **Given**: Digest A가 아카이브되어, A의 진술이 B(active)의 진술과 맺고 있던 관계가 연쇄로 archived됐다.
- **When**: 유저가 각각의 Digest 상세를 본다.
- **Then**:
  1. B(active)의 관련 Digest 목록에서는 A가 더 이상 나타나지 않는다.
  2. A(archived)의 관련 Digest 목록에서는 B와의 관계가 archived 상태로 여전히 표시된다.
- **관여 화면**: Digest 상세, Changeset 상세

#### 관련 Reference 자동 제안

- **Given**: 진술·관계 생성이 완료되었고, 서로 다른 진술이 같은 Reference를 함께 언급하고 있다(정확한 매칭 조건은 미정).
- **When**: 그 생성이 완료된다.
- **Then**: 그 Reference들이 서로 관련 Reference로 제안되어 채워진다. 사람은 이후 확인·제거만 가능하고, 직접 새로 추가할 수는 없다.
- **관여 화면**: Reference 상세

#### 판정 대기 relation changeset 생성

- **Given**: 새 진술이 기존 진술과 대조되었고, 관계가 애매하거나 충돌(conflicts) 또는 중복(duplicates)으로 판단된다.
- **When**: 관계 엔진이 그 쌍을 처리한다.
- **Then**: 그 쌍마다 별도의 relation changeset이 open 상태로 생성되어 변경셋 탭의 Open 목록에서 판정을 기다린다.
- **관여 화면**: 변경셋

#### Changeset 제목 자동 생성 (relation - 충돌)

- **Given**: 판정 대기 relation changeset이 충돌(conflicts) 제안으로 생성된다.
- **When**: changeset이 생성된다.
- **Then**: 제목이 "A(끝점1 Statement 내용 요약) vs B(끝점2 Statement 내용 요약)" 형태로 채워진다. Digest 제목이 아니라 실제로 부딪히는 Statement 내용 요약이다 — Digest 제목은 더 넓은 주제를 담을 수 있어서 그대로 쓰면 정작 뭐가 부딪히는지 안 보일 수 있다.
- **관여 화면**: Changeset 상세, 관계 판정 화면
- **범위 참고 (surface-inventory.md 256행, mvp-wireframe.html)**: 07-modeling.md `Changeset.title` 규칙.

#### Changeset 제목 자동 생성 (relation - 중복)

- **Given**: 판정 대기 relation changeset이 중복(duplicates) 제안으로 생성된다.
- **When**: changeset이 생성된다.
- **Then**: "A vs B" 대립 프레임이 아니라, 이 changeset의 결과물인 병합 제안 Digest 자신의 제목을 changeset 제목으로 그대로 쓴다. 헤더 제목은 읽기 전용이고, 실제 편집은 병합 제안 카드의 제목 입력 하나뿐이며 헤더는 그 값을 따라간다.
- **관여 화면**: Changeset 상세, 관계 판정 화면
- **범위 참고 (surface-inventory.md 294행)**: 병합 제안 Digest 자체가 백엔드에 아직 없어(판정 모드 미구현, product-decisions-log.md #18) 검증 불가 — 현재 코드는 충돌과 동일하게 "A vs B"를 채우는 임시(stopgap) 상태.

#### 재제안 가드

- **Given**: 유저가 특정 진술 쌍의 relation changeset을 버려서(discarded), 그 제안 자체가 틀렸다고 판단했다.
- **When**: 관계 엔진이 그 이후 배치에서 같은 쌍을 다시 검토한다.
- **Then**: 그 쌍에 대해 relation changeset을 다시 제안하지 않는다.
- **관여 화면**: 변경셋

#### 판정 모드 진입

- **Given**: open 상태인 relation changeset(충돌 또는 중복)이 있다.
- **When**: 변경셋 탭에서 그 항목을 클릭하거나, Digest 상세의 리뷰 대기 이동 버튼을 클릭한다.
- **Then**: Digest 상세가 판정 모드로 열리고, 근거가 된 두 진술 각각과 그 두 원문 각각의 하이라이트를 확인할 수 있다.
- **관여 화면**: 변경셋, Digest 상세

#### 충돌 판정 — 승자 선택

- **Given**: 유저가 판정 모드에서 서로 충돌하는 두 진술을 보고 있다.
- **When**: 그중 하나를 선택해 판정을 확정한다.
- **Then**:
  1. 선택된 진술은 active 상태로 남는다.
  2. 선택되지 않은 진술은 삭제되지 않고 archived되어 가려진다(보존·되살리기 가능).
  3. relation changeset이 closed+applied 상태로 전환된다.
- **관여 화면**: Digest 상세(판정 모드)

#### 중복 판정 — 병합

- **Given**: 유저가 판정 모드에서 같은 뜻으로 판단된 두 진술(중복 후보)를 보고 있고, 각각 서로 다른 Digest에 속해 있다.
- **When**: 엔진이 제안한 병합 내용을 판정 화면 안에서 문서형으로 확인·수정하고 판정을 확정한다.
- **Then**:
  1. 기존 두 Digest는 archive되고, 병합된 새 Digest가 생성되어 그 내용을 바탕으로 진술·관계 생성이 새로 시작된다.
  2. relation changeset이 closed+applied 상태로 전환된다.
- **관여 화면**: Digest 상세(판정 모드)

#### 판정 대기 relation changeset 버리기

- **Given**: 유저가 판정 모드에서 open 상태인 relation changeset(충돌 또는 중복)을 보고 있다.
- **When**: 버리기 액션을 실행한다.
- **Then**:
  1. 이 changeset이 closed+discarded 상태로 전환된다.
  2. 두 진술은 그대로 active 상태로 유지된다(제안 자체가 틀렸다는 판단이라 어느 쪽도 안 지워짐).
  3. 재제안 가드가 걸려 이 쌍은 이후 다시 제안되지 않는다.
- **관여 화면**: Digest 상세(판정 모드)

#### 버려진 relation changeset 되살리기

- **Given**: 유저가 closed+discarded 상태인 relation changeset을 보고 있다.
- **When**: 되살리기 액션을 실행한다.
- **Then**: 이 changeset의 상태가 open으로 되돌아가 다시 판정할 수 있다.
- **관여 화면**: Changeset 상세

#### 충돌 판정 되돌리기

- **Given**: 유저가 Changeset 상세에서 충돌 판정으로 closed+applied된 relation changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  2. archived됐던(패배한) 진술이 active 상태로 복원된다.
  3. 같은 진술 쌍에 대해 새로운 open 상태의 relation changeset이 생성되어 다시 판정할 수 있게 된다.
- **관여 화면**: Changeset 상세, Digest 상세(판정 모드)

#### 중복 판정 되돌리기

- **Given**: 유저가 Changeset 상세에서 중복 판정(병합)으로 closed+applied된 relation changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 병합 이후 다른 Digest가 병합된 Digest의 진술과 새로 관계를 맺었다면, 되돌릴 때 그 관계도 함께 archive된다는 안내가 컨펌 모달로 먼저 표시된다.
  2. 확인하면 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  3. 병합으로 생성됐던 새 Digest와 그 진술, 그 진술이 걸린 다른 관계들이 모두 연쇄로 archive된다.
  4. 원래 있던 두 Digest와 그 원래 진술이 active 상태로 복원된다.
  5. 같은 진술 쌍에 대해 새로운 open 상태의 relation changeset이 생성되어 다시 판정할 수 있게 된다.
- **관여 화면**: Changeset 상세, Digest 상세(판정 모드)

#### 확신 관계 자동 적용 되돌리기

- **Given**: 유저가 Changeset 상세에서 확신 관계로 자동 적용된 relation changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  2. 관계 타입이 replaces·resolves처럼 상대 진술을 archive시켰다면 그 진술이 active로 복원되고, supports처럼 아무것도 archive하지 않았다면 연결만 제거된다.
- **관여 화면**: Changeset 상세

#### Changeset 상세 — 삭제된 원문의 스냅샷 콘텐츠 치환

- **Given**: 삭제된 원문의 Digest·진술이 다른(살아있는) 원문 소속 relation changeset에 스냅샷으로 남아 있다.
- **When**: 배치 purge가 실행된다.
- **Then**: 그 changeset 자체(배지·시각·판정 결과)는 남지만, 그 안의 삭제된 콘텐츠 필드만 삭제 표시로 치환된다.
- **관여 화면**: Changeset 상세

## Manual 편집

### 케이스 목록

- [ ] Changeset 제목 미생성 (manual)
- [ ] 편집 changeset 되돌리기
- [ ] 아카이브 되살리기
- [ ] 아카이브된 상태에서 편집 잠금
- [ ] 수정 이력 항목 클릭 시 상세 확인
- [ ] Reference 직접 수정 동시성 충돌

### 케이스 상세

#### Changeset 제목 미생성 (manual)

- **Given**: 유저가 Digest 또는 Reference를 직접 수정(또는 아카이브)한다.
- **When**: manual changeset이 생성된다.
- **Then**: changeset 제목을 채우지 않는다(항상 null). manual changeset은 변경셋 목록·Changeset 상세 어디에도 뜨지 않고, 오직 그 대상(Digest·Reference)의 "변경 이력" 모달에서만 조회되며 그 모달의 행 라벨은 제목이 아니라 수정 시각+수정한 사람이라, changeset 제목 자체가 읽힐 자리가 없다.
- **관여 화면**: (해당 없음 — 변경셋 목록·Changeset 상세에 안 뜨는 것 자체가 이 케이스의 요점)
- **범위 참고 (surface-inventory.md 74·246행)**: "manual은 변경셋 탭엔 아예 안 뜬다"·"번호는 이 화면 밖(변경셋 목록)에서만 의미 있는 앵커" — 같은 원칙이 제목에도 적용됨. 현재 구현(`confirm_digest_edit` 등, PR #435)은 대상 콘텐츠 제목을 changeset 제목에 채우고 있는데, 이건 아무 데도 안 쓰이는 불필요한 작업이라 제거 대상(코드 수정 필요).

#### 편집 changeset 되돌리기

- **Given**: 유저가 Digest(또는 Reference)의 수정 이력에서 편집(본문 수정 등)으로 생성된 manual changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  2. 그 수정으로 archive됐던 이전 버전이 active로 복원되고, 수정으로 만들어진 새 버전은 archive된다.
- **관여 화면**: Digest 상세, Reference 상세

#### 아카이브 되살리기

- **Given**: 유저가 아카이브된 Digest(또는 Reference) 상세를 보고 있다.
- **When**: 되살리기 액션을 실행한다.
- **Then**:
  1. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  2. 그 Digest(또는 Reference)가 active 상태로 복원된다.
- **관여 화면**: Digest 상세, Reference 상세

#### 아카이브된 상태에서 편집 잠금

- **Given**: 유저가 아카이브된 Digest(또는 Reference) 상세를 보고 있다.
- **When**: 그 상세에 진입한다.
- **Then**: Tag·Topic·외부 링크·본문 편집 등 모든 수정 액션이 비활성화되고, 아카이브된 상태라 그렇다는 이유가 함께 표시된다. 되살리기 액션만 남는다.
- **관여 화면**: Digest 상세, Reference 상세

#### 수정 이력 항목 클릭 시 상세 확인

- **Given**: 유저가 Digest(또는 Reference) 상세의 수정 이력 목록을 보고 있다.
- **When**: 특정 changeset 항목을 클릭한다.
- **Then**: 변경셋 탭을 거치지 않고, 그 changeset의 상세로 바로 이동해 변경 전후 내용을 확인할 수 있다.
- **관여 화면**: Digest 상세, Reference 상세, Changeset 상세

#### Reference 직접 수정 동시성 충돌

- **Given**: 유저가 Reference 상세에서 수정을 시도하는데, 그 사이 다른 사람이 이미 같은 Reference를 수정해 archive된 상태다.
- **When**: 수정 제출 액션을 실행한다.
- **Then**: 제출이 거부되고 새로고침을 유도하는 안내가 표시된다. 편집 내용은 반영되지 않는다.
- **관여 화면**: Reference 상세
