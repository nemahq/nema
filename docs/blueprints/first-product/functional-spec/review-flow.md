# 리뷰·후처리 플로우

> 4개 changeset 타입(ingestion/relation/manual/revert) 전체의 리뷰·확정·버리기·되돌리기·되살리기를 다룬다. ingestion 1단계 처리가 끝나 후보가 생성된 시점부터 시작.

### 함께 보는 문서

- [기능 명세서 인덱스](README.md)
- [넣기 플로우](intake-flow.md)
- 표면 인벤토리(`../surface-inventory.md`): Digest 상세, Digest 리뷰 화면, 변경셋, Changeset 상세, 초안

### 시나리오

## Ingestion 리뷰

### 케이스 목록

- Digest 추출 완료 → ingestion changeset 자동 생성
- Digest 리뷰 화면 진입
- 원문에 없는 필드는 비워둠
- Digest 타입 제안
- 신규 Topic·Tag 제안
- 기존 Topic·Tag 재사용 제안
- 기존 Topic·Tag는 이름 수정 불가
- 신규 Topic·Tag 이름 수정 가능
- Digest 리뷰 화면에서 Topic·Tag 추가 — 기존 선택
- Digest 리뷰 화면에서 Topic·Tag 추가 — 신규 생성
- Reference 후보 자동 제안 및 매칭
- Changeset 제목 자동 생성
- Digest 후보 삭제
- Digest 리뷰 확정
- Digest 리뷰 버리기
- 적용된 리뷰 되돌리기
- 원본도 삭제하기
- 버려진 리뷰 되살리기
- 원본 삭제 후 되살리기 비활성화
- 신규 Reference 후보 편집
- 기존 Reference 후보 병합 편집
- 타입 변경 시 필드 초기화
- 원문 대조 포커스 전환
- Digest 리뷰 화면에서 외부 링크 추가
- Digest 리뷰 화면에서 외부 링크 수정
- Digest 리뷰 화면에서 외부 링크 삭제
- Digest 리뷰 화면에서 @ 멘션 — 기존 Reference 선택
- Digest 리뷰 화면에서 @ 멘션 — 새 Reference 생성
- 모든 후보 삭제 시 확정 비활성화
- 제목 없이 확정 비활성화

### 케이스 상세

#### Digest 추출 완료 → ingestion changeset 자동 생성

- **Given**: 유저가 제출한 Source의 Digest 추출이 진행 중이다.
- **When**: 추출이 완료되어 하나 이상의 Digest 후보와 Reference 후보가 나온다.
- **Then**:
  1. ingestion changeset이 open 상태로 자동 생성된다.
  2. 그 changeset은 변경셋 탭의 Open 목록과 Digest 리뷰 화면에서 확인할 수 있게 된다.
- **관여 화면**: 변경셋, Digest 리뷰 화면

#### Digest 리뷰 화면 진입

- **Given**: open 상태인 ingestion changeset이 있다.
- **When**: 그 changeset의 Digest 리뷰 화면에 진입한다.
- **Then**:
  1. 추출된 Digest 후보와 Reference 후보가 문서형 편집 카드로 나열된다.
  2. 사이드뷰의 원문 탭이 첫 후보의 위치가 하이라이트된 채로 기본으로 열려 있다.
- **관여 화면**: Digest 리뷰 화면

#### 원문에 없는 필드는 비워둠

- **Given**: Digest 추출 결과, 특정 optional 필드에 해당하는 내용이 원문에 없다.
- **When**: Digest 리뷰 화면에서 그 후보를 본다.
- **Then**: 그 필드는 지어낸 내용 없이 빈 칸으로 제안된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 타입 제안

- **Given**: Digest 추출이 진행 중이다.
- **When**: Digest 후보가 생성된다.
- **Then**: 엔진이 원문 내용을 분석해 5가지 타입(결정·미결·학습·아이디어·가정) 중 하나를 제안하고, 그 타입에 맞는 본문 필드 구조로 후보가 제시된다.
- **관여 화면**: Digest 리뷰 화면

#### 신규 Topic·Tag 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이 Space/Workspace에 아직 없는 주제·태그에 해당한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 엔진이 새로 만든 Topic·Tag가 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 기존 재사용 라벨과 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면

#### 기존 Topic·Tag 재사용 제안

- **Given**: Digest 추출이 진행 중이고, 원문 내용이 이미 존재하는 Topic·Tag와 일치한다.
- **When**: Digest 후보가 생성된다.
- **Then**: 새로 만들지 않고 기존 Topic·Tag가 재사용되어 그 후보에 미리 채워진 채로 나타난다. 같은 후보 안에 신규 라벨과 함께 섞여 나올 수 있다(배타적이지 않음).
- **관여 화면**: Digest 리뷰 화면

#### 기존 Topic·Tag는 이름 수정 불가

- **Given**: 유저가 Digest 리뷰 화면에서 기존 Topic·Tag가 재사용 제안된 후보를 보고 있다.
- **When**: 그 라벨의 이름을 수정하려 시도한다.
- **Then**: 이름은 읽기 전용이라 수정할 수 없다. 그 Digest에서 제거하는 것은 계속 가능하다.
- **관여 화면**: Digest 리뷰 화면

#### 신규 Topic·Tag 이름 수정 가능

- **Given**: 유저가 Digest 리뷰 화면에서 신규로 제안된 Topic·Tag가 있는 후보를 보고 있다.
- **When**: 그 라벨의 이름을 수정한다.
- **Then**: 아직 서버에 존재하지 않는 임시 상태이므로, 수정한 이름이 이 changeset의 편집 중인 내용에 즉시 반영된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 Topic·Tag 추가 — 기존 선택

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Topic·Tag 추가 액션을 실행해 검색하고, 일치하는 기존 라벨을 선택한다.
- **Then**: 그 기존 라벨이 이 changeset의 편집 중인 내용에 즉시 추가된다. 새 라벨은 생성되지 않는다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 화면에서 Topic·Tag 추가 — 신규 생성

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: Topic·Tag 추가 액션을 실행해 검색했지만 일치하는 라벨이 없어, 새로 만들기를 선택한다.
- **Then**: 검색어를 이름으로 하는 새 라벨이 이 changeset의 편집 중인 내용에 즉시 추가된다.
- **관여 화면**: Digest 리뷰 화면

#### Reference 후보 자동 제안 및 매칭

- **Given**: Digest 추출이 진행 중이고, 원문에 사람·조직·프로젝트·제품·개념으로 분류할 만한 대상이 언급되어 있다.
- **When**: Digest 후보가 생성된다.
- **Then**: 그 대상이 레지스트리에 이미 있으면 기존 Reference 후보로, 없으면 신규 Reference 후보로 분류되어 함께 제안된다.
- **관여 화면**: Digest 리뷰 화면

#### Changeset 제목 자동 생성

- **Given**: Digest 추출이 완료되어 하나 이상의 Digest 후보가 나왔다.
- **When**: ingestion changeset이 생성된다.
- **Then**: 엔진이 원문 전체를 보고 그 changeset의 제목을 생성한다(여러 Digest가 같은 주제를 공유하면 그 주제, 갈리면 전체를 아우르는 요약형 제목).
- **관여 화면**: Digest 리뷰 화면

#### Digest 후보 삭제

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보 카드들을 보고 있다.
- **When**: 후보 하나의 삭제 액션을 실행한다.
- **Then**: 컨펌 모달 없이 그 후보가 즉시 이 changeset의 편집 중인 내용에서 제거된다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 확정

- **Given**: 유저가 Digest 리뷰 화면에서 하나 이상의 Digest 후보를 보고 있다.
- **When**: 확정 액션을 실행한다.
- **Then**:
  1. 이 changeset이 closed+applied 상태로 전환된다.
  2. 남은 Digest·Reference 후보가 모두 확정되어 활성 상태가 된다.
  3. Statement·Relation 생성이 시작된다.
  4. 화면은 이동하지 않고 그대로 남아, 상태 표시만 적용 완료를 나타내도록 바뀐다.
- **관여 화면**: Digest 리뷰 화면

#### Digest 리뷰 버리기

- **Given**: 유저가 Digest 리뷰 화면에서 하나 이상의 Digest 후보를 보고 있다.
- **When**: 버리기 액션을 실행한다.
- **Then**:
  1. 이 changeset이 closed+discarded 상태로 전환된다.
  2. Digest·Reference가 아무것도 생성되지 않는다.
  3. 원본 Source는 초안(pending)으로 돌아간다.
  4. 화면은 이동하지 않고 그대로 남아, 상태 표시만 버려짐을 나타내도록 바뀐다.
- **관여 화면**: Digest 리뷰 화면

#### 적용된 리뷰 되돌리기

- **Given**: 유저가 Digest 리뷰 화면에서 적용된 상태인 changeset을 보고 있다.
- **When**: 되돌리기 액션을 실행한다.
- **Then**:
  1. 새로운 revert changeset이 즉시 closed+applied 상태로 생성된다.
  2. 이 changeset이 만든 Digest들이 archive되고, 원본 Source는 초안(pending)으로 돌아간다.
  3. 되돌리기 액션은 그 revert changeset의 상세로 이동하는 링크로 바뀐다.
- **관여 화면**: Digest 리뷰 화면, Changeset 상세

#### 원본도 삭제하기

- **Given**: 유저가 Digest 리뷰 화면에서 버려지거나 되돌려진 changeset을 보고 있다.
- **When**: 원본도 삭제하기 액션을 실행한다.
- **Then**:
  1. 그 원본(Source)이 즉시 trashed 상태로 전환된다.
  2. 원본도 삭제하기 액션이 사라진다.
- **관여 화면**: Digest 리뷰 화면

#### 버려진 리뷰 되살리기

- **Given**: 유저가 Digest 리뷰 화면에서 버려진 상태인 changeset을 보고 있다.
- **When**: 되살리기 액션을 실행한다.
- **Then**:
  1. 이 changeset의 상태가 open으로 되돌아간다.
  2. 버리기 직전의 편집 상태(삭제했던 후보 등)가 그대로 복원된다.
  3. 변경셋 탭에서도 이 changeset이 Closed에서 Open으로 옮겨간다.
- **관여 화면**: Digest 리뷰 화면, 변경셋

#### 원본 삭제 후 되살리기 비활성화

- **Given**: 유저가 Digest 리뷰 화면에서 버려진 changeset의 원본도 삭제하기를 실행해, 그 원본이 trashed 상태가 되었다.
- **When**: Digest 리뷰 화면에 진입한다.
- **Then**: 되살리기 액션이 비활성화된 채로 남아 있고, 원본이 삭제되어 되살릴 수 없다는 이유가 함께 표시된다.
- **관여 화면**: Digest 리뷰 화면

#### 신규 Reference 후보 편집

- **Given**: 유저가 Digest 리뷰 화면에서 레지스트리에 매칭되지 않은 신규 Reference 후보를 보고 있다.
- **When**: 타입·이름·설명을 수정한다.
- **Then**: 수정한 내용이 이 changeset의 편집 중인 내용에 즉시 반영된다.
- **관여 화면**: Digest 리뷰 화면

#### 기존 Reference 후보 병합 편집

- **Given**: 유저가 Digest 리뷰 화면에서 레지스트리에 매칭된 기존 Reference 후보를 보고 있다.
- **When**: 엔진이 제안한 병합 설명을 수정한다.
- **Then**: 수정한 내용이 이 changeset의 편집 중인 내용에 즉시 반영된다. 타입·이름은 읽기 전용으로 유지되어 수정할 수 없다.
- **관여 화면**: Digest 리뷰 화면

#### 타입 변경 시 필드 초기화

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보를 보고 있다.
- **When**: 그 후보의 타입을 다른 타입으로 변경한다.
- **Then**: 컨펌 모달 없이 기존 타입 전용 필드 내용이 즉시 초기화되고 새 타입의 필드로 전환된다.
- **관여 화면**: Digest 리뷰 화면

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

#### 모든 후보 삭제 시 확정 비활성화

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보와 Reference 후보를 딱 하나만 남기고 나머지를 모두 삭제한 상태다.
- **When**: 그 마지막 남은 후보를 삭제한다.
- **Then**: 확정 액션이 비활성화되고, 후보가 하나도 없어 확정할 게 없다는 이유가 함께 표시된다. 버리기 액션은 계속 사용할 수 있다.
- **관여 화면**: Digest 리뷰 화면

#### 제목 없이 확정 비활성화

- **Given**: 유저가 Digest 리뷰 화면에서 Digest 후보의 제목을 입력한 상태다.
- **When**: 그 제목을 모두 지운다.
- **Then**: 확정 액션이 비활성화되고, 제목이 필요하다는 이유가 함께 표시된다.
- **관여 화면**: Digest 리뷰 화면

## 실행취소

### 케이스 목록

- 실행취소

### 케이스 상세

#### 실행취소

- **Given**: 유저가 Digest 리뷰 화면에서 실행취소 가능한 액션(예: 후보 삭제)을 방금 실행했다.
- **When**: 실행취소 액션을 실행한다.
- **Then**: 그 직전 액션이 되돌려진다.
- **관여 화면**: Digest 리뷰 화면
