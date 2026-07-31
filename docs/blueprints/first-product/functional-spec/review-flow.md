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
- [x] Digest 리뷰 화면 진입 — Digest 후보 나열
- [x] Digest 리뷰 화면 진입 — Reference 후보 나열
- [x] 원문에 없는 필드는 비워둠
- [x] Digest 타입 제안
- [x] 신규 Topic 제안
- [x] 신규 Tag 제안
- [x] 기존 Topic 재사용 제안
- [x] 기존 Tag 재사용 제안
- [x] 기존 Topic은 이름 수정 불가
- [x] 기존 Tag는 이름 수정 불가
- [x] 기존 Tag는 색상 수정 불가
- [x] 신규 Topic 이름 수정 가능
- [x] 신규 Tag 이름 수정 가능
- [x] Digest 리뷰 화면에서 Topic 추가 — 기존 선택
- [x] Digest 리뷰 화면에서 Tag 추가 — 기존 선택
- [x] Digest 리뷰 화면에서 Topic 추가 — 신규 생성
- [x] Digest 리뷰 화면에서 Tag 추가 — 신규 생성
- [x] Tag 색상 지정 — 신규 생성 시
- [x] 라벨 정렬 — 신규 먼저
- [x] Reference 후보 자동 제안 및 매칭
- [x] Changeset 제목 자동 생성 (ingestion)
- [x] Digest 후보 삭제
- [x] Digest 리뷰 확정
- [x] Digest 리뷰 버리기
- [x] 적용된 리뷰 되돌리기
- [x] Changeset 제목 자동 생성 (revert)
- [x] 버려진 리뷰 되살리기
- [ ] 원문 삭제 후 되살리기 비활성화
- [x] 신규 Reference 후보 편집
- [x] 기존 Reference 후보 병합 편집
- [x] 타입 변경 시 필드 초기화
- [ ] 원문 대조 포커스 전환
- [ ] Digest 리뷰 화면에서 외부 링크 추가
- [ ] Digest 리뷰 화면에서 외부 링크 수정
- [ ] Digest 리뷰 화면에서 외부 링크 삭제
- [ ] Digest 리뷰 화면에서 @ 멘션 — 기존 Reference 선택
- [ ] Digest 리뷰 화면에서 @ 멘션 — 새 Reference 생성
- [ ] 엔진 제안 대비 교정 신호 기록
- [ ] Digest 후보 외부 AI 도구 공개 여부 설정
- [x] 모든 후보 삭제 시 확정 비활성화
- [x] 제목 없이 확정 비활성화

### 케이스 상세

#### Digest 추출 완료 → ingestion changeset 자동 생성

- **Given**: 유저가 제출한 Source의 Digest 추출이 진행 중이다.
- **When**: 추출이 완료되어, Digest·Reference·Topic·Tag 후보를 모두 담은 하나의 변경(changeset)이 만들어진다.
- **Then**:
  1. ingestion changeset이 open 상태로 자동 생성된다.
  2. 그 changeset은 변경셋 탭의 Open 목록과 Digest 리뷰 화면에서 확인할 수 있게 된다.
- **관여 화면**: 변경셋, Digest 리뷰 화면
- **확정 (2026-07-20, Kyle 실동작 확인)**: `digestSource`가 추출 완료 후 `create_ingestion_review` RPC를 호출해 changeset을 `status='pending'`(제품 용어 open)으로 생성한다(`apps/server/src/infra/statement-sync/digestion.ts`). 변경셋 탭(Open)과 Digest 리뷰 화면(`digestReview.get`) 모두 같은 `status='pending'` 가드로 조회하므로 Then #1·#2가 구조적으로 보장됨. 코드 레벨 확인 후 Kyle이 실사용으로 확인해 체크.

#### 검토 대기 배지 실시간 갱신 (LNB·Space 오버뷰)

- **Given**: 유저가 LNB/Space 오버뷰를 보고 있다.
- **When**: ingestion changeset이 새로 열린다.
- **Then**: 새로고침 없이 LNB의 Space 목록 배지와 Space 오버뷰의 변경사항 탭 배지가 실시간으로 갱신된다.
- **관여 화면**: LNB, Space 오버뷰, 변경셋
- **범위 참고**: 두 배지 모두 `space.openChangesetCount` 하나를 공유(`SpaceListItem.tsx`/`SpaceTabs.tsx`). Supabase Realtime 도입(PR #419)으로 실시간 갱신.

#### Digest 리뷰 화면 진입 — Digest 후보 나열

- **Given**: 유저가 변경사항 리스트(Open)에서 ingestion changeset 행을 본다.
- **When**: 그 행을 클릭해 Digest 리뷰 화면에 진입한다.
- **Then**: 추출된 Digest 후보가 문서형 편집 카드로 나열된다.
- **관여 화면**: 변경셋, Digest 리뷰 화면
- **범위 참고**: 원문 위치 하이라이트 동기화는 별도 케이스 "원문 대조 포커스 전환"으로 이관 — 여기선 중복 검증하지 않는다.

#### Digest 리뷰 화면 진입 — Reference 후보 나열

- **Given**: 유저가 변경사항 리스트(Open)에서 ingestion changeset 행을 본다.
- **When**: 그 행을 클릭해 Digest 리뷰 화면에 진입한다.
- **Then**: 추출된 Reference 후보가 문서형 편집 카드로 나열된다.
- **관여 화면**: 변경셋, Digest 리뷰 화면
- **범위 참고**: Reference는 여러 Source·Digest에 걸쳐 재사용되는 공유 자원이라 원문 위치가 하나로 안 좁혀진다 — Reference 상세 화면이 "원문 보기"를 두지 않고 "인용하는 Digest" 목록으로 대체한 것과 같은 이유(surface-inventory.md). 후보 카드도 같은 원칙 — 원문 하이라이트 대신 이 후보를 인용하는 Digest 후보로 맥락을 보여준다.

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

#### 신규 Topic 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이 Space에 아직 없는 주제에 해당한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 엔진이 새로 만든 Topic이 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 기존 재사용 Topic과 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #515)**: `digest-review-service.ts`의 `getReview`가 레지스트리에 매칭 안 되는 Topic을 `registryId: null`(신규)로 후보에 미리 채우고, 확정 시 `confirm_ingestion_review`가 find-or-create(`ON CONFLICT ... DO UPDATE`)로 실제 행을 만든다. 같은 후보 안에서 기존/신규 Topic이 배타적이지 않게 섞일 수 있는 구조. `id`(항목 정체성)와 `registryId`(재사용 판정 신호)가 분리된 뒤로 Topic 단위로 독립적으로 재검증됨. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 신규 Tag 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이 Workspace에 아직 없는 태그에 해당한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 엔진이 새로 만든 Tag가 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 기존 재사용 Tag와 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #515·#517)**: `digest-review-service.ts`의 `getReview`가 레지스트리에 매칭 안 되는 Tag를 `registryId: null`(신규)로 후보에 미리 채우고, 확정 시 `confirm_ingestion_review`가 find-or-create(`ON CONFLICT ... DO UPDATE`)로 실제 행을 만든다. 같은 후보 안에서 기존/신규 Tag가 배타적이지 않게 섞일 수 있는 구조. 신규 Tag는 이제 색상도 함께 제안된다("Tag 색상 지정 — 신규 생성 시" 참고). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 기존 Topic 재사용 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이미 존재하는 Topic과 일치한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 새로 만들지 않고 기존 Topic이 재사용되어 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 신규 Topic과 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-20, QA 세션 / 2026-07-28 PR #515 갱신)**: 이름이 일치하는 `status='active'` Topic은 `registryId`가 채워져 재사용되고, archived 항목은 재사용 후보에서 제외된다(`digest-review-service.ts`). 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

#### 기존 Tag 재사용 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이미 존재하는 Tag와 일치한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 새로 만들지 않고 기존 Tag가 재사용되어 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 신규 Tag와 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-20, QA 세션 / 2026-07-28 PR #515·#517 갱신)**: 이름이 일치하는 `status='active'` Tag는 `registryId`가 채워져 재사용되고, archived 항목은 재사용 후보에서 제외된다(`digest-review-service.ts`). 그 Tag가 이미 가진 색상도 그대로 후보에 실려 온다 — 붙이는 순간 새 랜덤 색이 아니라 기존 색 그대로 보인다("Tag 색상 지정 — 신규 생성 시" 참고). 코드 레벨로만 확인, 실동작 브라우저 확인은 아직 없어 미체크로 남김.

#### 기존 Topic은 이름 수정 불가

- **Given**: 유저가 Digest 리뷰 화면에서 기존 Topic이 재사용 제안된 후보를 보고 있다.
- **When**: 그 라벨의 이름을 수정하려 시도한다.
- **Then**: 이름은 읽기 전용이라 수정할 수 없다. 그 Digest에서 제거하는 것은 계속 가능하다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-27, PR #506·#510 갱신)**: 이전 구현(`EditableLabelChip`의 `readOnly` 인라인 편집)은 걷어냈다 — 레지스트리 기존 라벨의 이름을 화면에서 즉시 바꾸면 그 Topic을 쓰는 다른 모든 Digest의 표시가 같이 바뀌는데, 이건 이 리뷰 화면 하나의 스코프를 벗어나는 조작이라 컨센서스 위반으로 판단됐다(PR #506). 지금은 기존 라벨에 이름 수정 진입점 자체가 없다 — 검색 목록에서 첨부·해제만 가능하고, 미트볼(⋯) 메뉴는 신규 라벨에만 뜬다(`TopicSearchList.tsx`). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 기존 Tag는 이름 수정 불가

- **Given**: 유저가 Digest 리뷰 화면에서 기존 Tag가 재사용 제안된 후보를 보고 있다.
- **When**: 그 라벨의 이름을 수정하려 시도한다.
- **Then**: 이름은 읽기 전용이라 수정할 수 없다. 그 Digest에서 제거하는 것은 계속 가능하다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-27, PR #506·#510 갱신)**: Topic과 같은 이유로 이름 수정 진입점 자체가 없다(`TagSearchList.tsx`) — 위 "기존 Topic은 이름 수정 불가" 참고. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 기존 Tag는 색상 수정 불가

- **Given**: 유저가 Digest 리뷰 화면에서 기존 Tag가 재사용 제안된 후보를 보고 있다.
- **When**: 그 라벨의 색상을 수정하려 시도한다.
- **Then**: 색상도 이름과 마찬가지로 수정할 수 없다. 그 Digest에서 제거하는 것은 계속 가능하다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #517)**: Tag 색상 필드(`tags.color`)가 생겼고, 리뷰 화면의 일관된 원칙(신규는 자유 편집, 기존은 첨부/제거만) 그대로 적용됐다 — 기존 Tag를 재사용해 붙일 때는 그 Tag가 이미 가진 색이 그대로 실려 오고, 여기서 바꾸는 진입점은 없다("Digest 리뷰 화면에서 Tag 추가 — 기존 선택" 참고). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 신규 Topic 이름 수정 가능

- **Given**: 유저가 Digest 리뷰 화면에서 신규로 제안된 Topic이 있는 후보를 보고 있다.
- **When**: 검색 목록에서 그 라벨 행의 미트볼(⋯) 메뉴를 눌러 편집 팝오버를 열고 이름을 수정한다.
- **Then**: 아직 서버에 존재하지 않는 임시 상태이므로, 수정한 이름이 이 changeset의 편집 중인 내용에 즉시 반영된다. 레지스트리 기존 이름이나 같은 Digest 안의 다른 신규 라벨과 이름이 겹치면 저장이 막힌다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #510·#515 갱신)**: 이전엔 칩을 인라인 `<input>`으로 바로 고치는 방식이었는데, 걷어내고 미트볼(⋯) → 편집 팝오버(`LabelDraftEditPopover` + `TopicDraftRenameForm`) 방식으로 다시 만들었다 — 레지스트리 기존 라벨의 인라인 rename을 걷어낸 것(PR #506)과 같은 리팩터의 연장. `registryId === null`이 신규 판정 기준이고(`id`는 항목 정체성 전용, PR #515), 그 값이 신규인 라벨의 검색 목록 행에만 이 진입점이 뜬다. 중복 이름 검증(레지스트리 + 같은 Digest 내 다른 신규 라벨)도 이 팝오버의 생성 폼과 공유. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 신규 Tag 이름 수정 가능

- **Given**: 유저가 Digest 리뷰 화면에서 신규로 제안된 Tag가 있는 후보를 보고 있다.
- **When**: 검색 목록에서 그 라벨 행의 미트볼(⋯) 메뉴를 눌러 편집 팝오버를 열고 이름을 수정한다.
- **Then**: 아직 서버에 존재하지 않는 임시 상태이므로, 수정한 이름이 이 changeset의 편집 중인 내용에 즉시 반영된다. 레지스트리 기존 이름이나 같은 Digest 안의 다른 신규 라벨과 이름이 겹치면 저장이 막힌다. 같은 팝오버에서 색상도 함께 바꿀 수 있다("Tag 색상 지정 — 신규 생성 시" 참고).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #510·#515·#517 갱신)**: Topic과 같은 리팩터(`TagDraftRenameForm`) — 위 "신규 Topic 이름 수정 가능" 참고. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### Digest 리뷰 화면에서 Topic 추가 — 기존 선택

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Topic 추가 액션을 실행해 검색하고, 일치하는 기존 Topic을 선택한다.
- **Then**: 그 기존 Topic이 이 changeset의 편집 중인 내용에 즉시 추가된다. 새 라벨은 생성되지 않는다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-15, PR #414 / 2026-07-28 PR #510 갱신)**: `TopicAddPopover`의 검색·선택 구현됨. 리뷰에서 `topic.list`가 Space 스코프 없이 다른 Space의 동명 Topic까지 "기존"으로 노출하던 크로스-Space 버그를 발견해 `spaceId` 파라미터 추가로 수정. 붙인 뒤 칩 목록에서의 표시 순서는 "라벨 정렬 — 신규 먼저" 케이스 참고. 실동작 확인 아직 안 됨.

#### Digest 리뷰 화면에서 Tag 추가 — 기존 선택

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Tag 추가 액션을 실행해 검색하고, 일치하는 기존 Tag를 선택한다.
- **Then**: 그 기존 Tag가 이 changeset의 편집 중인 내용에 즉시 추가된다. 새 라벨은 생성되지 않는다. 그 Tag가 이미 가진 색상도 그대로 딸려 온다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-15, PR #414 / 2026-07-28 PR #510·#517 갱신)**: `TagAddPopover`의 검색·선택 구현됨. Tag는 원래 Workspace 스코프라 Topic이 겪은 크로스-Space 버그는 해당 없음. 붙인 뒤 표시 순서는 "라벨 정렬 — 신규 먼저" 참고. 실동작 확인 아직 안 됨.

#### Digest 리뷰 화면에서 Topic 추가 — 신규 생성

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Topic 추가 액션을 실행해 검색했지만 일치하는 라벨이 없어, 새로 만들기를 선택한다.
- **Then**: 검색어를 이름으로 하는 새 Topic이 즉시 추가된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-15 / 2026-07-28 갱신)**: Topic은 Tag와 다르게 별도 필드 없이 이름만으로 즉시 생성됨. 신규 생성 뒤에도 이름을 계속 고칠 수 있다("신규 Topic 이름 수정 가능" 참고). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### Digest 리뷰 화면에서 Tag 추가 — 신규 생성

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Tag 추가 액션을 실행해 검색했지만 일치하는 라벨이 없어, 새로 만들기를 선택한다.
- **Then**: 이름(검색어 프리필)+설명 2필드 미니 폼을 거쳐야 추가된다(`description`이 필수 필드라서). 색상도 이 폼에서 함께 지정되며, 랜덤으로 하나가 미리 선택된 채로 시작한다("Tag 색상 지정 — 신규 생성 시" 참고).
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-15 / 2026-07-28 PR #517 갱신)**: Tag가 Topic과 다르게 description 필수라 미니 폼을 거치는 구조. 신규 생성 뒤에도 이름·색상을 계속 고칠 수 있다("신규 Tag 이름 수정 가능" 참고). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### Tag 색상 지정 — 신규 생성 시

- **Given**: 유저가 Digest 리뷰 화면에서 신규로 생성 중인(아직 확정 전) Tag를 보고 있다.
- **When**: 생성 폼 또는 미트볼(⋯) 편집 팝오버에서 그 Tag의 색상을 지정한다(예: "위험" 계열 태그를 빨강으로).
- **Then**:
  1. 생성 시점에 이미 팔레트 중 하나가 랜덤으로 미리 선택된 채로 시작한다 — 엔진이 제안한 Tag도, 사용자가 직접 만든 Tag도 마찬가지다.
  2. 아직 서버에 존재하지 않는 임시 상태이므로, 지정한 색상이 이 changeset의 편집 중인 내용에 즉시 반영되고, 확정 전까지는 이름과 마찬가지로 몇 번이든 다시 바꿀 수 있다.
  3. 확정 시 리뷰에서 마지막으로 보여준 색이 그대로 Tag 모델에 저장된다(레지스트리 삽입 시 별도로 다시 랜덤 배정하지 않는다) — 확정 후 화면 전반에서 같은 색으로 표시된다.
  4. Topic은 색상을 갖지 않는다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #517)**: 새 팔레트를 만들지 않고 weave의 기존 `TagColor` 8종(slate·cyan·sage·olive·terracotta·rose·mauve·violet)을 재사용한다. 색은 콘텐츠 이해와 무관한 순수 표시값이라 LLM 프롬프트엔 안 넣고, id를 배정하는 바로 그 자리(엔진 제안은 `write_ingestion_review_changes`, 사용자 생성은 리뷰 화면의 생성 폼)에서 순수 랜덤 함수로 배정한다. 생성 폼은 가로 4×2 스와치 그리드(`TagColorGridPicker`), 편집 팝오버는 세로 리스트(스와치+색 이름, `TagColorListPicker`) — 둘 다 신규 weave 컴포넌트(`TagColorPicker.tsx`). 기존(레지스트리) Tag도 이 PR의 마이그레이션이 전부 백필해 색 없는 Tag가 없다. Digest 타입 배지가 이미 같은 8색 팔레트 중 5개를 고정 배정해 쓰고 있어(`DIGEST_TYPE_TAG_COLOR`) 카드 안에서 우연히 같은 색이 나란히 보일 수 있는데, 실제 화면에서 보고 판단하기로 하고 이번 스코프에서 막지 않았다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 라벨 정렬 — 신규 먼저

- **Given**: 유저가 Digest 리뷰 화면에서 기존 라벨과 신규(draft) 라벨이 섞인 Digest 후보를 보고 있다.
- **When**: Digest 후보 카드의 Topic·Tag 목록을 확인한다.
- **Then**: 신규 라벨이 항상 기존 라벨보다 앞에 온다. 같은 그룹(신규끼리, 기존끼리) 안에서는 원래 순서가 유지된다. Topic은 칩 없이 텍스트를 구분자(·)로 이어 붙이는 방식이라, 인접한 신규 Topic끼리는 그 구분자를 찍지 않는다. Tag는 각각 독립된 Badge 칩이라 이 구분자 개념 자체가 없다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-28, PR #510)**: `DigestTopicPicker`/`DigestTagPicker` 둘 다 `registryId === null`(신규) 여부만 비교하는 `stable sort`로 신규를 앞으로 옮긴다 — "+" 표식의 의도("아직 확정 전이니 먼저 보고 판단하라")와 맞추기 위함. `id` 기반 식별(PR #515)이 전제된 뒤에야 정렬해도 삭제·수정이 엉뚱한 항목을 안 건드리는 게 보장된다. 구분자 스킵 로직(`showSeparator`)은 `DigestTopicPicker`에만 있다 — `DigestTagPicker`는 라벨을 Badge 칩으로 렌더링해 애초에 구분자를 쓰지 않는다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### Reference 후보 자동 제안 및 매칭

- **Given**: Digest 추출이 진행 중이고, 원문에 사람·조직·프로젝트·제품·개념으로 분류할 만한 대상이 언급되어 있다.
- **When**: Digest 후보가 생성된다.
- **Then**: 그 대상이 레지스트리에 이미 있으면 기존 Reference 후보로, 없으면 신규 Reference 후보로 분류되어 함께 제안된다.
- **관여 화면**: Digest 리뷰 화면
- **범위 참고 (2026-07-20, QA 세션)**: `digest-generation.ts` 프롬프트가 사람·조직·프로젝트·제품·개념(person/organization/project/product/term) 분류와 레지스트리 매칭 여부에 따른 기존/신규 분기를 명시적으로 지시한다.
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**

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
- **범위 참고 (2026-07-14, PR #412)**: 신설된 `discard_ingestion_review` RPC(가드: `type='ingestion' AND status='pending'`, changes 미생성)와 `useDiscardReview`로 Then #1~#3 구현.
- **갱신 (2026-07-18)**: Then #4를 확정과 같은 이유로 뒤집어 자동 이동으로 바꿨다(위 "Digest 리뷰 확정" 갱신·design-decisions-log.md 2026-07-18 항목 참고). `useDiscardReview`의 `onSuccess` 콜백에서 `goToClosedReview()` 호출로 구현.

#### 적용된 리뷰 되돌리기

- **Given**: 유저가 Changeset 상세에서 적용된 상태인 changeset을 보고 있다(Digest 리뷰 화면은 open 전용이라 여기 해당 없음 — `digestReview.get` RPC 가드가 `status='pending'`만 허용).
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 컨펌 다이얼로그 없이 즉시 실행된다.
  2. 이 changeset이 만든 Digest들이 즉시 archive되고, Source는 초안(pending)으로 돌아간다.
  3. 새로운 revert changeset이 `open` 상태로 생성된다 — 확정됐던 Digest 콘텐츠가 changeset 자신의 기록에서 그대로 복원된 draft를 담고 있다(LLM 재호출 없음). 이 행 자체가 재판정 화면이다.
  4. 성공 시 새로 생성된 revert changeset의 상세(재판정 화면)로 자동 이동한다.
- **관여 화면**: Changeset 상세, Digest 리뷰 화면(재판정)
- **범위 참고 (2026-07-14, PR #412; 갱신 PR #438; 재설계 2026-07-29)**: `revertChangeset`(changeset-service.ts)이 `revert_changeset` RPC(`p_title` — 완성된 제목 문자열을 미리 조합해 넘김)를 호출, 응답의 `revertChangesetNumber`로 이동. RPC는 원본 changeset의 `changes`(target_type='digest', action='create')를 새 target_id로 복제해 revert changeset에 붙이고 `status='open'`으로 생성한다(`changeset_is_ingestion_shaped`로 판정). 이 revert changeset은 `digestReview.get`/`updateReview`/`confirmReview`/`discardReview`/`restoreReview` 등 기존 Digest 리뷰 화면 RPC 전부를 `type IN ('ingestion','revert')` 가드로 그대로 받아들인다.
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**

#### Changeset 제목 자동 생성 (revert)

- **Given**: 유저가 적용된 changeset을 되돌린다(이미 되돌려진 changeset을 다시 되돌리는 체이닝 포함).
- **When**: 되돌리기(revert) changeset이 생성된다.
- **Then**: 제목이 원본 제목을 따옴표로 감싸고 "되돌림"(UI 언어에 맞는 자연스러운 표현)을 붙인 형태로 저장된다. 이미 되돌려진 changeset을 다시 되돌리면 깊이를 계산해 접미사를 늘리지 않고, 그 문자열을 그대로 한 번 더 감싼다(`"OO" 되돌림` → `""OO" 되돌림" 되돌림`). 원본 제목이 없으면(번호 자리표시자 폴백 중) 이 되돌리기도 같은 폴백을 물려받아 감싼다.
- **관여 화면**: Changeset 상세, 변경셋
- **범위 참고 (재설계 2026-07-29, migration 20260729140505)**: `revert_depth` 정수 컬럼과 FE(`features/review/utils.ts`)의 title+revertDepth 조합 로직을 폐기했다. UI 언어를 아는 서버 계층(`changeset-service.ts`의 `composeRevertTitle`)이 `revert_changeset` RPC를 호출하기 전에 완성된 제목 문자열을 조합해 `p_title`로 넘기고, RPC는 그 값을 그대로 저장한다 — SQL 문자열 concat이던 이전 구현(따옴표 중첩 버그, 영어 UI 한/영 혼재 버그)을 대체한다. `아카이브 되살리기`/`편집 changeset 되돌리기`(manual 대상 revert) 경로도 같은 방식으로 제목을 조합하도록 맞췄다(`digest-service.ts`/`reference-service.ts`, `find_manual_archive_changeset` RPC로 원본 title/number를 먼저 조회).
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**

#### 버려진 리뷰 되살리기

- **Given**: 유저가 Digest 리뷰 화면에서 버려진 상태인 changeset을 보고 있다.
- **When**: 되살리기 액션을 실행한다.
- **Then**:
  1. 이 changeset의 상태가 open으로 되돌아간다.
  2. 버리기 직전의 편집 상태(삭제했던 후보 등)가 그대로 복원된다.
  3. 변경셋 탭에서도 이 changeset이 Closed에서 Open으로 옮겨간다.
- **관여 화면**: Digest 리뷰 화면, 변경셋
- **범위 참고 (2026-07-14, PR #412; 갱신 2026-07-27, 리뷰 draft 서버 영속화 재설계 이후)**: 화면 배치가 이 케이스의 Given과 다르다(위 두 케이스와 같은 이유) — 되살리기 액션은 Changeset 상세에만 뒀다(`useRestoreReview` + `restore_ingestion_review` RPC). Then #1·#3은 구현. Then #2("버리기 직전의 편집 상태가 복원된다")는 도입 당시엔 구조적으로 불가능했다 — 그때의 `discard_ingestion_review`는 changes를 아예 안 만드는 방식이라 서버에 복원할 "편집 중이던 상태" 자체가 없었다. 그런데 리뷰 draft가 클라이언트 오버라이드 방식에서 서버 영속 autosave 방식으로 재설계되면서(product-decisions-review-flow.md #21) 전제가 바뀌었다 — 현재 `discard_ingestion_review`(migration 20260726075454)는 changes를 건드리지 않고 changeset status·outcome만 바꾸므로, 되살리면 discard 직전까지 autosave된 편집 상태(후보 삭제 포함)가 그대로 남아있을 것으로 보인다.
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**

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
- **범위 참고 (2026-07-31)**: Kyle 판단으로 이번 구현 배치에서 펜딩 — 착수 보류.

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

- [x] 실행취소
- [x] 다시 실행
- [x] 새로고침 후 최신 저장 상태 유지

### 케이스 상세

#### 실행취소

- **Given**: 유저가 Digest 리뷰 화면에서 실행취소 가능한 액션을 하나 이상 실행했다.
- **When**: 실행취소 액션을 실행한다.
- **Then**: 가장 최근 액션부터 순서대로 하나씩 되돌려진다. 이 실행취소 기록은 세션 스코프라 새로고침하면 사라진다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-28, PR #509)**: `ReviewDraftProvider`가 액션별 역연산표 대신 매 `dispatch` 직전 draft 전체 스냅샷을 `undoStack`에 push하고, `undo()`가 그걸 통째로 pop해 쿼리 캐시에 다시 써넣는 방식이라 "예외 없이 모든 액션 타입이 자동으로 실행취소 대상이 된다"(코드 주석). 스택은 세션 동안 GC되지 않는 캐시(`gcTime: Infinity`)에 맞춰 `MAX_UNDO_STACK_SIZE = 50`으로 캡을 둔다. 복원 시 `draftVersion`만은 스냅샷 값이 아니라 캐시의 현재 값을 유지해, 되돌리기 자체가 자동저장 버전 충돌(NM012)을 유발하지 않게 막는다. 단축키는 `mod+z`(전역), 제목·설명 등 `<textarea>` 안에서는 `enableOnFormTags: false`로 꺼져 있어 브라우저 네이티브 텍스트 실행취소에 양보한다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 다시 실행

- **Given**: 유저가 방금 실행취소를 실행했다.
- **When**: 다시 실행 액션을 실행한다.
- **Then**: 실행취소했던 액션이 다시 적용된다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-28, PR #509)**: `redo()`도 동일하게 스냅샷 통째 push/pop 방식이며 같은 50개 캡(`MAX_UNDO_STACK_SIZE`)을 공유한다. 실행취소 이후 새 액션을 실행하면(되돌리기가 아닌 편집) `redoStack`이 비워진다 — 분기된 실행취소 이후 히스토리는 보존하지 않는다. 단축키는 `mod+shift+z`, "실행취소" 케이스와 동일하게 폼 필드 안에서는 꺼진다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 새로고침 후 최신 저장 상태 유지

- **Given**: 유저가 Digest 리뷰 화면에서 여러 편집을 했다.
- **When**: 화면을 새로고침한다.
- **Then**: 마지막으로 반영된 편집 상태가 그대로 유지된다. 다만 실행취소로 되돌아갈 수 있는 기록은 사라진다.
- **관여 화면**: Digest 리뷰 화면

- **범위 참고 (2026-07-28, PR #509)**: "유지되는 것"과 "사라지는 것"이 서로 다른 저장소다 — 실행취소/다시 실행 스택은 `ReviewDraftProvider`의 React state라 새로고침하면 그냥 없어지지만, 편집 내용 자체는 이것과 별개로 1초 디바운스(`AUTOSAVE_DEBOUNCE_MS`)마다 서버로 자동저장되어 있어서 새로고침해도 안 사라진다 — 새로고침 시 화면은 그 서버 상태를 다시 fetch해 보여줄 뿐이다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

## 관계 판정

### 케이스 목록

- [x] 확신 관계 자동 적용
- [ ] 관련 Digest 자동 채움
- [ ] 관계 archive 시 관련 Digest 목록 표시 규칙
- [ ] 관련 Reference 자동 제안
- [x] 판정 대기 relation changeset 생성 (충돌)
- [ ] 판정 대기 relation changeset 생성 (중복)
- [x] Changeset 제목 자동 생성 (relation - 충돌)
- [x] Changeset 제목 자동 생성 (relation - 중복)
- [ ] 재제안 가드
- [x] 판정 모드 진입
- [x] 충돌 판정 — 승자 선택
- [x] 중복 판정 — 병합
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
- **Then**: relation changeset이 즉시 closed+applied 상태로 생성되어 조용히 적용된다. 사람의 판정 없이 변경셋 탭의 Closed 목록에서만 확인할 수 있다. 제목은 이 배치를 촉발한 원문(Source)의 제목을 그대로 차용한다 — 이 changeset은 그 원문 하나에서 나온 확신 연결들만 모은 것(1:1)이라 겹칠 일이 없고, closed로 태어나 title도 곧바로 얼어붙으므로 생성 시점 스냅샷 한 번이면 충분하다.
- **관여 화면**: 변경셋
- **범위 참고 (2026-07-29, 관계 판정 changeset 제목 생성 확장 슬라이스)**: 지금까지 title이 null이었던 걸 채웠다 — `apply_relation_changesets`(마이그레이션 `20260729150000_relation_conflict_title_and_batch_title.sql`)가 배치 changeset 생성 시점에 `sources.title`을 읽어 그대로 저장한다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.
- **범위 참고 (2026-07-28, PR #514)**: `changeset-detail-service.ts`가 supports/replaces/resolves 셋을 전부 `unsupported`로 뭉개던 걸 `relation_confident_applied`로 분리해, Changeset 상세를 열면 관계 종류 캡션+끝점 Digest 카드가 실제로 보인다. 한 changeset에 확신 관계가 여러 건 담길 수 있어(배치당 changeset 1개, 성공한 관계마다 change 행 하나) 본문이 `relations` 배열이다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

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

#### 판정 대기 relation changeset 생성 (충돌)

- **Given**: 새 진술이 기존 진술과 대조되었고, 충돌(conflicts)로 판단된다.
- **When**: 관계 엔진이 그 쌍을 처리한다.
- **Then**: 그 쌍마다 별도의 relation changeset이 open 상태로 생성되어 변경셋 탭의 Open 목록에서 판정을 기다린다.
- **관여 화면**: 변경셋
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**

#### 판정 대기 relation changeset 생성 (중복)

- **Given**: 새 진술이 기존 진술과 대조되었고, 중복(duplicates)으로 판단된다.
- **When**: 관계 엔진이 그 쌍을 처리한다.
- **Then**: 그 쌍마다 별도의 relation changeset이 open 상태로 생성되어 변경셋 탭의 Open 목록에서 판정을 기다린다.
- **관여 화면**: 변경셋
- **범위 참고 (2026-07-28, Kyle 결정; 2026-07-31 D7 결정으로 갱신)**: 원래 "애매하거나 충돌 또는 중복" 하나의 케이스였는데 충돌·중복으로 분리했다. 저확신도(애매한, 충돌·중복이 아닌) 관계 처리 방침은 별도 미결정 이슈(D7, Desktop/리뷰-플로우-중간점검.md)였으나 결정됐다 — pending으로 올리지 않고 changeset 자체를 안 만든 채 조용히 버린다. changeset이 안 생기니 이 케이스 목록엔 여전히 안 올림.

#### Changeset 제목 자동 생성 (relation - 충돌)

- **Given**: 판정 대기 relation changeset이 충돌(conflicts) 제안으로 생성된다.
- **When**: changeset이 생성된다.
- **Then**: 제목이 "뭐가 부딪히는지"를 요약한 짧은 제목으로 채워진다(예: "정기 회의 일정 충돌", "인증 방식 충돌 (세션 vs JWT)"). 끝점 진술 원문을 그대로 이어붙이면 진술이 길 때 목록에서 구분자조차 안 보여 스캔이 안 되던 문제를 해소한 것 — 관계 판정 LLM 콜이 이미 두 진술을 입력으로 받고 있어, 이 콜의 출력에 요약 제목 필드 하나를 얹었을 뿐 추가 LLM 콜은 없다. 요약이 비어 있으면(LLM 실패 등) "A(끝점1 진술 내용) vs B(끝점2 진술 내용)" 원문 이어붙이기로 폴백한다.
- **관여 화면**: Changeset 상세, 관계 판정 화면
- **범위 참고 (2026-07-29, 관계 판정 changeset 제목 생성 확장 슬라이스)**: 관계 엔진 2단계 판정 콜(`worker.ts` `callJudgment`, `RelationJudgmentSchema`)이 conflicts 판정일 때 `conflictTitle`도 함께 뽑도록 확장되고, 그 값이 있으면 `apply_relation_changesets`(마이그레이션 `20260729150000_relation_conflict_title_and_batch_title.sql`)가 title로 쓴다. 없으면 기존 "A vs B"로 낮아진다 — duplicates의 `merge_draft.title` 폴백 패턴과 동일. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.
- **범위 참고 (surface-inventory.md 256행, mvp-wireframe.html; 갱신 2026-07-28, PR #512)**: 07-modeling.md `Changeset.title` 규칙. 실제 코드가 이 규칙을 안 지키고 있었다 — `digests.title`을 join해 "Digest 제목 A vs Digest 제목 B"로 채우고 있었음(스펙 위반). `statements.content`를 직접 쓰도록 고치고, 이미 만들어진 open relation changeset도 같은 기준으로 백필했다. 재제안 가드 방향 버그(아래 "재제안 가드" 참고)도 같은 PR에서 같이 고쳤다.
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**

#### Changeset 제목 자동 생성 (relation - 중복)

- **Given**: 판정 대기 relation changeset이 중복(duplicates) 제안으로 생성된다.
- **When**: changeset이 생성된다.
- **Then**: "A vs B" 대립 프레임이 아니라, 이 changeset의 결과물인 병합 제안 Digest 자신의 제목을 changeset 제목으로 그대로 쓴다. 헤더 제목은 읽기 전용이고, 실제 편집은 병합 제안 카드의 제목 입력 하나뿐이며 헤더는 그 값을 따라간다.
- **관여 화면**: Changeset 상세, 관계 판정 화면(중복/병합)
- **범위 참고 (surface-inventory.md 294행; 갱신 2026-07-29, 중복 병합 초안 슬라이스)**: "A vs B" stopgap을 이번에 해소했다 — 관계 엔진 2단계가 duplicates 쌍을 pending으로 올릴 때 병합 제안 Digest 초안(제목·본문·topics·tags·referenceIds)을 LLM으로 eager 생성해 `changes.data`에 스냅샷하고, `apply_relation_changesets`가 그 초안의 title로 changeset 제목을 채운다(`worker.ts` `attachMergeDrafts`, 마이그레이션 `20260729100000_relation_merge_draft.sql`). LLM 초안 생성이 실패한 pending(드묾)은 기존 "A vs B" 폴백으로 조용히 낮아진다.
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**: 충돌·중복 모두 제목 생성은 LLM 콜로 진행됨을 확인.

#### 재제안 가드

- **Given**: 유저가 특정 진술 쌍의 relation changeset을 버려서(discarded), 그 제안 자체가 틀렸다고 판단했다.
- **When**: 관계 엔진이 그 이후 배치에서 같은 쌍을 다시 검토한다.
- **Then**: 그 쌍에 대해 relation changeset을 다시 제안하지 않는다.
- **관여 화면**: 변경셋
- **범위 참고 (2026-07-28, PR #512)**: 방향 뒤집힌 재제안(discard된 A→B 쌍이 B→A로 다시 뜨는 것)을 못 막던 버그를 고쳤다. `apply_relation_changesets`의 가드가 이제 conflicts·duplicates 두 타입만 방향 무관 OR 비교로 같은 쌍을 잡는다(worker.ts의 `changeKey`가 두 타입을 양끝 정렬해 collapse하는 것과 같은 이유 — 나머지 relation_type은 방향에 의미가 있어 그대로 방향 있게 비교). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 판정 모드 진입

- **Given**: open 상태인 relation changeset(충돌 또는 중복)이 있다.
- **When**: 변경셋 탭에서 그 항목을 클릭한다.
- **Then**: 관계 판정 화면(충돌이면 관계 판정 화면, 중복이면 관계 판정 화면(중복/병합))이 열리고, 근거가 된 두 진술 각각과 그 두 원문 각각의 하이라이트를 확인할 수 있다.
- **관여 화면**: 변경셋, 관계 판정 화면
- **범위 참고 (2026-07-28, PR #516)**: "Digest 상세가 판정 모드로 열린다"는 옛 서술은 surface-inventory.md 재검토(두 Statement가 서로 다른 Digest·Source에서 올 수 있어 Digest 상세에 욱여넣기 어렵다는 이유로 별도 화면으로 분리) 이후로 이미 stale했다 — 이번에 위 문구로 정정. 원문 하이라이트는 진술의 Digest 내 출처 칸(`sourceField`/`sourceFieldIndex`, PR #513)을 이용해 해당 필드(배열이면 특정 항목까지)를 강조한다(텍스트 매칭 아님).
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**: "중복 쪽은 미구현 — 클릭하면 찾을 수 없음"이라던 위 기록은 stale — 충돌·중복 둘 다 판정 모드 진입 자체는 됨. 관계 판정 화면(충돌·중복 모두) UI는 추후 다시 기획하지만, 기능 자체는 동작하므로 체크.

#### 충돌 판정 — 승자 선택

- **Given**: 유저가 판정 모드에서 서로 충돌하는 두 진술을 보고 있다.
- **When**: 그중 하나를 선택해 판정을 확정한다.
- **Then**:
  1. 선택된 진술은 active 상태로 남는다.
  2. 선택되지 않은 진술은 삭제되지 않고 archived되어 가려진다(보존·되살리기 가능).
  3. relation changeset이 closed+applied 상태로 전환된다.
- **관여 화면**: 관계 판정 화면
- **범위 참고 (2026-07-28, PR #516)**: 기존 `resolveConflictRelation` mutation을 그대로 재사용(신규 아님). 카드 선택은 배타적(라디오형)이나, **surface-inventory.md·이 케이스가 원래 전제하던 "이미 선택된 카드를 다시 클릭하면 미선택으로 돌아간다"는 재클릭 해제는 Kyle 지시로 이번에 의도적으로 빼고 만들었다** — 실수로 미선택 상태를 못 보고 확정을 누르는 사고를 막기 위함. 문서(이 케이스, surface-inventory.md 둘 다)는 아직 이 동작 변경을 반영 못 했다 — 이 결정을 지속한다면 두 문서 다 손봐야 한다. 확정 후 같은 URL이 자연히 Changeset 상세(적용됨)로 전환된다.
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**: 판정 화면 UI는 추후 재기획하지만, 기능 자체는 동작하므로 체크.

#### 중복 판정 — 병합

- **Given**: 유저가 판정 모드에서 같은 뜻으로 판단된 두 진술(중복 후보)를 보고 있고, 각각 서로 다른 Digest에 속해 있다.
- **When**: 엔진이 제안한 병합 내용을 판정 화면 안에서 문서형으로 확인·수정하고 판정을 확정한다.
- **Then**:
  1. 기존 두 Digest는 archive되고, 병합된 새 Digest가 생성되어 그 내용을 바탕으로 진술·관계 생성이 새로 시작된다.
  2. relation changeset이 closed+applied 상태로 전환된다.
- **관여 화면**: 관계 판정 화면(중복/병합)
- **확정 (2026-07-31, staging, Kyle 실동작 확인)**: 판정 화면 UI는 추후 재기획하지만, 기능 자체는 동작하므로 체크.

#### 판정 대기 relation changeset 버리기

- **Given**: 유저가 판정 모드에서 open 상태인 relation changeset(충돌 또는 중복)을 보고 있다.
- **When**: 버리기 액션을 실행한다.
- **Then**:
  1. 이 changeset이 closed+discarded 상태로 전환된다.
  2. 두 진술은 그대로 active 상태로 유지된다(제안 자체가 틀렸다는 판단이라 어느 쪽도 안 지워짐).
  3. 재제안 가드가 걸려 이 쌍은 이후 다시 제안되지 않는다.
- **관여 화면**: 관계 판정 화면 / 관계 판정 화면(중복/병합)
- **범위 참고 (2026-07-28, PR #516)**: 충돌 쪽만 구현됨 — 기존 `rejectPendingRelation` mutation을 그대로 재사용, 헤더에만 버튼 있음(카드 안 아님). 버린 뒤 같은 URL이 Changeset 상세(버려짐)로 전환되고, 그 화면 헤더에 되살리기 버튼이 뜬다(아래 "버려진 relation changeset 되살리기" 참고). 중복 쪽은 미구현. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 버려진 relation changeset 되살리기

- **Given**: 유저가 closed+discarded 상태인 relation changeset을 보고 있다.
- **When**: 되살리기 액션을 실행한다.
- **Then**: 이 changeset의 상태가 open으로 되돌아가 다시 판정할 수 있다.
- **관여 화면**: Changeset 상세
- **범위 참고 (2026-07-28, PR #516; 갱신 2026-07-29)**: `restore_pending_relation` RPC(`in-place`, `restore_ingestion_review`와 같은 패턴 — 새 changeset 안 만들고 같은 행의 status만 되돌림). 가드는 "같은 진술 쌍에 지금 open인 relation changeset이 없을 때"만 허용 — `apply_relation_changesets`(위 "재제안 가드" 참고)와 같은 방향 무관 비교를 재사용. 캐스케이드로 무효화된(사람이 거절한 게 아닌) discarded는 대상에서 제외. `type='relation'`뿐 아니라 `type='revert'`(충돌·중복 판정 되돌리기가 연 재판정 초안이 버려진 경우)도 같은 경로로 되살릴 수 있게 가드를 넓혔다. 되살리기 버튼은 Changeset 상세에만 있고 관계 판정 화면 자신에는 없다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 충돌 판정 되돌리기

- **Given**: 유저가 Changeset 상세에서 충돌 판정으로 closed+applied된 relation changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. archived됐던(패배한) 진술이 즉시 active 상태로 복원된다.
  2. 새로운 revert changeset이 `open` 상태로 생성된다 — 엔진의 원래 제안(`conflicts`, 같은 진술 쌍)이 changeset 자신의 기록에서 그대로 복원된 draft를 담고 있다. 이 행 자체가 관계 판정 화면(재판정)이다.
  3. 성공 시 새로 생성된 revert changeset의 상세(관계 판정 화면)로 자동 이동한다.
- **관여 화면**: Changeset 상세, 관계 판정 화면
- **범위 참고 (재설계 2026-07-29, migration 20260729140505)**: 이전엔 되돌리기가 즉시 closed+applied로 끝나 같은 쌍을 다시 판정할 방법이 없었다(brain business/nema/product-decisions "Relation judgment" #24 참고, 두 해결 방향 중 "revert changeset 자체를 open 가능하게 만들기"를 채택). `revert_changeset` RPC가 원본의 `changes`(target_type='relation', action='create', data->>'type'='conflicts')를 새 target_id로 복제해 revert changeset에 붙이고 `status='open'`으로 생성한다(`changeset_is_relation_judgment_shaped`로 판정). 이 revert changeset은 `resolveConflictRelation`/`rejectPendingRelation`/`restorePendingRelation` 등 기존 관계 판정 화면 RPC 전부를 `type IN ('relation','revert')` 가드로 그대로 받아들인다. 확신 관계 자동 적용(supports/replaces/resolves)을 되돌리는 경우는 재판정 화면이 없어(케이스 "확신 관계 자동 적용 되돌리기" 참고) 그대로 즉시 closed+applied다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 중복 판정 되돌리기

- **Given**: 유저가 Changeset 상세에서 중복 판정(병합)으로 closed+applied된 relation changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 병합으로 생성됐던 새 Digest와 그 진술, 그 진술이 걸린 다른 관계들이 모두 즉시 연쇄로 archive된다.
  2. 원래 있던 두 Digest와 그 원래 진술이 즉시 active 상태로 복원된다.
  3. 새로운 revert changeset이 `open` 상태로 생성된다 — 엔진의 원래 제안(`duplicates`, 병합 초안 포함)이 changeset 자신의 기록에서 그대로 복원된 draft를 담고 있다. 이 행 자체가 관계 판정 화면(중복/병합, 재판정)이다.
  4. 성공 시 새로 생성된 revert changeset의 상세(관계 판정 화면)로 자동 이동한다.
- **관여 화면**: Changeset 상세, 관계 판정 화면(중복/병합)
- **범위 참고 (신설 2026-07-29, migration 20260729140505)**: 충돌 판정 되돌리기와 같은 메커니즘 — 원본의 `changes`(data->>'type'='duplicates', `merge_draft` 포함)를 그대로 복제해 재판정 초안을 연다. 원래 있던 컨펌 모달(병합 이후 다른 Digest가 새로 맺은 관계도 함께 archive된다는 안내)은 다음 FE 슬라이스 몫 — 이 슬라이스는 백엔드(스키마·RPC)까지만이다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

#### 확신 관계 자동 적용 되돌리기

- **Given**: 유저가 Changeset 상세에서 확신 관계로 자동 적용된 relation changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  2. 관계 타입이 replaces·resolves처럼 상대 진술을 archive시켰다면 그 진술이 active로 복원되고, supports처럼 아무것도 archive하지 않았다면 연결만 제거된다.
- **관여 화면**: Changeset 상세
- **범위 참고 (2026-07-28, PR #514)**: 이 화면 자체("확신 관계 자동 적용" 케이스 참고)가 이번에 처음 생겨서, 이제 이 changeset을 열면 실제로 관계 종류+끝점 카드가 보이고 헤더의 되돌리기 버튼(기존 범용 `revert_changeset`, 신규 아님)이 실제로 뭘 되돌리는지 확인할 수 있다. 이전엔 본문이 `unsupported`로 비어 있어 버튼은 있어도 뭘 되돌리는지 볼 수 없었다. 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

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
- **범위 참고 (surface-inventory.md 74·246행; 갱신 2026-07-26, migration 20260726080000)**: "manual은 변경셋 탭엔 아예 안 뜬다"·"번호는 이 화면 밖(변경셋 목록)에서만 의미 있는 앵커" — 같은 원칙이 제목에도 적용됨. 이전 구현(`confirm_digest_edit` 등, PR #435)은 대상 콘텐츠 제목을 changeset 제목에 채우고 있었으나, 아무 데도 안 쓰이는 불필요한 작업이라 판단돼 제거됐다(`confirm_digest_edit`·`update_reference`·`archive_reference`·`archive_digest` 전부 title을 안 채우도록 수정). 코드 레벨 확인, 실동작 확인 전이라 미체크로 남김.

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
