# 둘러보기 플로우

> 스레드 피드를 훑어보고, Digest 상세(평소 열람)와 Reference 목록/상세를 보는 흐름을 다룬다. 판정 모드 진입은 [`review-flow.md`](review-flow.md) 몫.

### 함께 보는 문서

- [기능 명세서 인덱스](README.md)
- 표면 인벤토리(`../surface-inventory.md`): Space 오버뷰(스레드 탭), Digest 상세, Reference 목록

### 시나리오

## 스레드 피드

### 케이스 목록

- Space 오버뷰 최초 진입 (데모 데이터)
- Space 오버뷰 빈 상태 (데이터 전부 제거 후)
- 변경셋 탭 빈 상태
- Digest 카드 클릭 → 상세 열람
- Topic 필터
- Digest 카드 — 처리 중 표시
- Digest 카드 — 리뷰 대기 배지

### 케이스 상세

#### Space 오버뷰 최초 진입 (데모 데이터)

- **Given**: 유저가 인증을 완료했고, 이 Space엔 삭제하지 않고 그대로 둬도 상관없는 데모 Digest들이 미리 채워져 있다.
- **When**: Space 오버뷰(스레드 탭)에 진입한다.
- **Then**: 데모 Digest들이 시간순으로 스레드 피드에 표시된다.
- **관여 화면**: Space 오버뷰

#### Space 오버뷰 빈 상태 (데이터 전부 제거 후)

- **Given**: 유저가 인증을 완료했고, 이전에 있던 Digest가 모두 제거되어 지금은 하나도 없다.
- **When**: Space 오버뷰(스레드 탭)에 진입한다.
- **Then**: 데모 데이터 없이 단순 안내 문구만 표시된다.
- **관여 화면**: Space 오버뷰

#### 변경셋 탭 빈 상태

- **Given**: 유저가 Space 오버뷰에 있고, 이 Space에 변경셋이 하나도 없다.
- **When**: 변경셋 탭으로 전환한다.
- **Then**:
  1. 대기 중 개수 배지가 표시되지 않는다.
  2. 변경셋 탭 안에 빈 상태 안내 문구가 표시된다.
- **관여 화면**: Space 오버뷰

#### Digest 카드 클릭 → 상세 열람

- **Given**: 유저가 Space 오버뷰 스레드 피드에서 Digest 카드 목록을 보고 있다.
- **When**: 카드 하나를 클릭한다.
- **Then**:
  1. 그 Digest의 상세가 우측 사이드뷰에 열린다.
  2. 원래 보던 스레드 피드는 그대로 유지된다(화면 전환 없음).
- **관여 화면**: Space 오버뷰, Digest 상세

#### Topic 필터

- **Given**: 유저가 Space 오버뷰 스레드 탭에서 여러 Topic이 섞인 피드를 보고 있다(기본값은 "전체").
- **When**: 특정 Topic으로 필터를 적용한다.
- **Then**: 그 Topic이 붙은 Digest 카드만 표시된다.
- **관여 화면**: Space 오버뷰

#### Digest 카드 — 처리 중 표시

- **Given**: 유저가 인증을 완료했고, 스레드 피드에 Statement·Relation 생성이 진행 중인 Digest가 있다.
- **When**: Space 오버뷰(스레드 탭)에 진입한다.
- **Then**: 그 Digest의 카드에 진행 중 표시가 뜬다. 처리가 완료되면 그 표시는 사라진다.
- **관여 화면**: Space 오버뷰

#### Digest 카드 — 리뷰 대기 배지

- **Given**: 유저가 인증을 완료했고, 스레드 피드의 Digest 중 판정 대기 변경셋(충돌·중복)에 걸린 것이 있다.
- **When**: Space 오버뷰(스레드 탭)에 진입한다.
- **Then**: 그 Digest의 카드에 리뷰 대기 배지가 뜬다.
- **관여 화면**: Space 오버뷰

## 사이드뷰

### 케이스 목록

- 이미 열린 대상 재클릭 → 중복 없이 기존 탭으로 전환
- 사이드뷰 탭 개별 닫기
- 마지막 탭 닫기 → 사이드뷰 사라짐

### 케이스 상세

#### 이미 열린 대상 재클릭 → 중복 없이 기존 탭으로 전환

- **Given**: 유저가 사이드뷰에 이미 특정 Digest(또는 Reference)를 연 탭을 갖고 있다.
- **When**: 다른 곳에서 같은 대상을 다시 클릭한다.
- **Then**:
  1. 새 탭이 만들어지지 않는다.
  2. 이미 열려 있던 그 탭으로 전환된다.
- **관여 화면**: Digest 상세, Reference 상세

#### 사이드뷰 탭 개별 닫기

- **Given**: 유저가 사이드뷰에 탭을 2개 이상 열어두고 있다.
- **When**: 그중 하나의 닫기 액션을 실행한다.
- **Then**:
  1. 그 탭만 닫힌다.
  2. 나머지 탭과 사이드뷰는 그대로 유지된다.
- **관여 화면**: Digest 상세, Reference 상세

#### 마지막 탭 닫기 → 사이드뷰 사라짐

- **Given**: 유저가 사이드뷰에 탭을 1개만 열어두고 있다.
- **When**: 그 탭의 닫기 액션을 실행한다.
- **Then**: 사이드뷰 자체가 사라진다.
- **관여 화면**: Digest 상세, Reference 상세

## Digest 상세

### 케이스 목록

- 판정 대기 배지 표시
- 관련 Digest 섹션 표시
- 외부 링크 섹션 표시
- 관련 Digest 클릭 → 새 탭 열림
- 관련 Digest 행에서 changeset 링크 클릭
- Reference 멘션 클릭 → 새 탭 열림
- Topic 추가
- Topic 제거
- Tag 추가
- Tag 제거
- 외부 링크 추가
- 외부 링크 수정
- 외부 링크 삭제
- 본문 편집 제출
- 본문 편집 제출 실패 (동시성 충돌)
- 본문 편집 취소
- 타입 변경 시 필드 초기화 확인
- 본문 편집 중 @ 멘션 추가
- 원문 보기
- 공유

### 케이스 상세

#### 판정 대기 배지 표시

- **Given**: 유저가 스레드 피드에서 Digest 카드 목록을 보고 있다.
- **When**: 카드 하나를 클릭해 그 Digest 상세를 연다.
- **Then**: 연결된 Statement가 판정 대기 변경셋(충돌·중복)에 걸려 있으면 맨 위에 리뷰 대기 항목 목록과 이동 버튼이 표시되고, 없으면 표시되지 않는다.
- **관여 화면**: Space 오버뷰, Digest 상세

#### 관련 Digest 섹션 표시

- **Given**: 유저가 스레드 피드에서 Digest 카드 목록을 보고 있다.
- **When**: 카드 하나를 클릭해 그 Digest 상세를 연다.
- **Then**: 판정·확신 관계로 연결된 관련 Digest가 있으면, 행마다 관계의 종류·그 Digest로 향하는 링크·관계가 판정된 changeset으로 향하는 링크가 표시된다(읽기 전용, 사람이 추가·제거 불가). 없으면 섹션 자체가 생략된다.
- **관여 화면**: Space 오버뷰, Digest 상세

#### 외부 링크 섹션 표시

- **Given**: 유저가 스레드 피드에서 Digest 카드 목록을 보고 있다.
- **When**: 카드 하나를 클릭해 그 Digest 상세를 연다.
- **Then**: 외부 링크가 있으면 목록과 함께 표시되고, 없으면 목록 없이 추가 액션만 남는다.
- **관여 화면**: Space 오버뷰, Digest 상세

#### 관련 Digest 클릭 → 새 탭 열림

- **Given**: 유저가 사이드뷰에서 Digest 상세 탭 하나를 보고 있고, 그 Digest에 관련 Digest가 연결되어 있다.
- **When**: 관련 Digest 항목을 클릭한다.
- **Then**:
  1. 그 Digest의 상세가 같은 사이드뷰 안에 새 탭으로 열린다.
  2. 원래 보던 탭은 그대로 남아 있다.
- **관여 화면**: Digest 상세

#### 관련 Digest 행에서 changeset 링크 클릭

- **Given**: 유저가 Digest 상세에서 관련 Digest 행을 보고 있다.
- **When**: 그 행의 changeset 링크를 클릭한다.
- **Then**: 그 관계를 판정(또는 자동 적용)한 relation changeset의 상세로 이동한다.
- **관여 화면**: Digest 상세, Changeset 상세

#### Reference 멘션 클릭 → 새 탭 열림

- **Given**: 유저가 사이드뷰에서 Digest 상세 탭 하나를 보고 있고, 본문에 Reference를 가리키는 멘션이 있다.
- **When**: 그 멘션을 클릭한다.
- **Then**:
  1. 그 Reference의 상세가 같은 사이드뷰 안에 새 탭으로 열린다.
  2. 원래 보던 탭은 그대로 남아 있다.
- **관여 화면**: Digest 상세, Reference 상세

#### Topic 추가

- **Given**: 유저가 Digest 상세를 평소 열람 중이다.
- **When**: Topic 추가 액션을 실행하고 Topic을 선택하거나 입력한다.
- **Then**:
  1. 그 Topic이 즉시 추가된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### Topic 제거

- **Given**: 유저가 Digest 상세를 평소 열람 중이고, 그 Digest에 Topic이 하나 이상 붙어 있다.
- **When**: 그중 하나의 제거 액션을 실행한다.
- **Then**:
  1. 그 Topic이 즉시 제거된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### Tag 추가

- **Given**: 유저가 Digest 상세를 평소 열람 중이다.
- **When**: Tag 추가 액션을 실행하고 태그를 입력한다.
- **Then**:
  1. 그 Tag가 즉시 추가된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### Tag 제거

- **Given**: 유저가 Digest 상세를 평소 열람 중이고, 그 Digest에 Tag가 하나 이상 붙어 있다.
- **When**: 그중 하나의 제거 액션을 실행한다.
- **Then**:
  1. 그 Tag가 즉시 제거된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### 외부 링크 추가

- **Given**: 유저가 Digest 상세를 평소 열람 중이다.
- **When**: 외부 링크 추가 액션을 실행하고 URL을 입력한다.
- **Then**:
  1. 그 링크가 즉시 추가된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### 외부 링크 수정

- **Given**: 유저가 Digest 상세를 평소 열람 중이고, 그 Digest에 외부 링크가 하나 이상 있다.
- **When**: 그중 하나의 URL을 수정하는 액션을 실행한다.
- **Then**:
  1. 그 링크가 수정한 URL로 즉시 반영된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### 외부 링크 삭제

- **Given**: 유저가 Digest 상세를 평소 열람 중이고, 그 Digest에 외부 링크가 하나 이상 있다.
- **When**: 그중 하나의 삭제 액션을 실행한다.
- **Then**:
  1. 그 외부 링크가 즉시 삭제된다.
  2. 별도 changeset은 생성되지 않는다.
- **관여 화면**: Digest 상세

#### 본문 편집 제출

- **Given**: 유저가 Digest 상세를 평소 열람 중이다.
- **When**: 본문 편집 액션을 실행해 제목·요약·본문·타입 중 하나 이상을 수정하고 제출을 확인한다.
- **Then**:
  1. 기존 Digest는 archive된다.
  2. 새 Digest가 그 내용으로 생성된다.
  3. manual changeset이 즉시 closed+applied 상태로 기록된다.
  4. 보고 있던 탭은 새 Digest로 전환되어 계속 그 내용을 보여준다.
- **관여 화면**: Digest 상세

#### 본문 편집 제출 실패 (동시성 충돌)

- **Given**: 유저가 Digest 상세 본문 편집 모드에서 제출을 시도하는데, 그 사이 다른 사람이 이미 같은 Digest를 수정해 archive된 상태다.
- **When**: 제출 액션을 실행한다.
- **Then**:
  1. 제출이 거부된다.
  2. 새로고침을 유도하는 안내가 표시된다.
  3. 편집 내용은 반영되지 않는다.
- **관여 화면**: Digest 상세

#### 본문 편집 취소

- **Given**: 유저가 Digest 상세 본문 편집 모드에서 내용을 일부 수정한 상태다.
- **When**: 취소 액션을 실행하거나 편집 중인 채로 화면을 벗어난다.
- **Then**:
  1. 로컬 편집 내용만 사라진다.
  2. 서버엔 아무 변경도 남지 않는다(changeset 생성 안 됨).
  3. 원래 Digest가 그대로 유지된다.
- **관여 화면**: Digest 상세

#### 타입 변경 시 필드 초기화 확인

- **Given**: 유저가 Digest 상세 본문 편집 모드에 있다.
- **When**: 타입을 다른 타입으로 변경한다.
- **Then**:
  1. 컨펌 모달이 뜬다.
  2. 확인하면 기존 타입 전용 필드 내용이 초기화된 채 새 타입의 필드로 전환된다.
- **관여 화면**: Digest 상세

#### 본문 편집 중 @ 멘션 추가

- **Given**: 유저가 Digest 상세 본문 편집 모드에서 본문을 고치고 있다.
- **When**: 본문 필드에서 @ 멘션 액션을 실행해 Reference를 선택하거나 새로 만든다.
- **Then**:
  1. 그 멘션이 편집 중인 본문에 삽입된다.
  2. 아직 changeset은 생기지 않고, 제출해야 이 Digest의 참조로 확정된다.
- **관여 화면**: Digest 상세

#### 원문 보기

- **Given**: 유저가 Digest 상세를 평소 열람 중이다.
- **When**: 원문 보기 액션을 실행한다.
- **Then**:
  1. 그 Digest의 원본(Source) 탭이 같은 사이드뷰 안에 열린다(이미 열려 있으면 그 탭으로 포커스 이동).
  2. 이 Digest가 나온 위치가 하이라이트되어 표시된다.
- **관여 화면**: Digest 상세

#### 공유

- **Given**: 유저가 Digest 상세를 평소 열람 중이다.
- **When**: 공유 액션을 실행한다.
- **Then**: 단순 URL 링크가 아니라, 그 Digest의 내용(타입·제목·요약·본문 등)이 외부로 복사·전달할 수 있는 형태로 준비된다.
- **관여 화면**: Digest 상세

## Reference 목록

### 케이스 목록

- Reference 목록 표시
- Reference 엔트리 클릭 → 상세 열람
- Reference 상세 — 변경 이력 표시
- Reference 직접 수정
- Reference Tag 추가
- Reference Tag 제거
- 엔진이 제안한 관련 Reference 거부
- Reference 외부 링크 추가
- Reference 외부 링크 수정
- Reference 외부 링크 삭제

### 케이스 상세

#### Reference 목록 표시

- **Given**: 유저가 인증을 완료했다.
- **When**: LNB에서 Reference 목록에 진입한다.
- **Then**: 이 Workspace에 Reference 엔트리가 있으면 목록으로 표시되고, 없으면 빈 상태 안내 문구가 표시된다.
- **관여 화면**: Reference 목록

#### Reference 엔트리 클릭 → 상세 열람

- **Given**: 유저가 Reference 목록에서 엔트리 목록을 보고 있다.
- **When**: 엔트리 하나를 클릭한다.
- **Then**: 그 Reference의 상세가 사이드뷰에 열린다.
- **관여 화면**: Reference 목록, Reference 상세

#### Reference 상세 — 변경 이력 표시

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었다.
- **When**: 변경 이력 보기 액션을 실행한다.
- **Then**: 이 Reference를 건드린 Changeset들(Source 제출로 생긴 것과 목록에서 직접 수정한 것 모두)이 이력으로 표시된다.
- **관여 화면**: Reference 상세

#### Reference 직접 수정

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었다.
- **When**: 수정 액션을 실행해 이름·설명 등을 고치고 제출을 확인한다.
- **Then**:
  1. 그 Reference의 내용이 수정한 값으로 즉시 반영된다.
  2. 그 수정이 변경 이력에 새 항목으로 추가된다.
- **관여 화면**: Reference 상세

#### Reference Tag 추가

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었다.
- **When**: Tag 추가 액션을 실행하고 태그를 입력한다.
- **Then**: 그 Tag가 즉시 추가된다.
- **관여 화면**: Reference 상세

#### Reference Tag 제거

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었고, 그 Reference에 Tag가 하나 이상 붙어 있다.
- **When**: 그중 하나의 제거 액션을 실행한다.
- **Then**: 그 Tag가 즉시 제거된다.
- **관여 화면**: Reference 상세

#### 엔진이 제안한 관련 Reference 거부

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었고, 엔진이 제안해 채워진 관련 Reference가 하나 이상 있다.
- **When**: 그중 하나의 제거 액션을 실행한다.
- **Then**: 그 관련 Reference 연결이 즉시 제거된다. 사람이 직접 새로운 관련 Reference를 추가하는 기능은 없다 — 관련짓고 싶은 사실이 있다면 그 내용을 새로 저장(Source 제출)하는 것이 정석 경로다.
- **관여 화면**: Reference 상세

#### Reference 외부 링크 추가

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었다.
- **When**: 외부 링크 추가 액션을 실행하고 URL을 입력한다.
- **Then**: 그 링크가 즉시 추가된다.
- **관여 화면**: Reference 상세

#### Reference 외부 링크 수정

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었고, 그 Reference에 외부 링크가 하나 이상 있다.
- **When**: 그중 하나의 URL을 수정하는 액션을 실행한다.
- **Then**: 그 링크가 수정한 URL로 즉시 반영된다.
- **관여 화면**: Reference 상세

#### Reference 외부 링크 삭제

- **Given**: 유저가 Reference 상세를 사이드뷰로 열었고, 그 Reference에 외부 링크가 하나 이상 있다.
- **When**: 그중 하나의 삭제 액션을 실행한다.
- **Then**: 그 외부 링크가 즉시 삭제된다.
- **관여 화면**: Reference 상세
