# 용어 사전

제품 용어(사용자에게 노출)와 코드 용어(내부 구현)의 매핑.

> "개념 용어"는 코드·설계 문서에서 참조하는 내부 식별자, "코드 용어"는 실제 구현체. 구현이 없는 항목은 표시해둠.

## 콘텐츠 — 무엇이 쌓이는가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 맥락 | Context | Context | (해당 없음, 파생 개념) | Statement와 Relation이 쌓여 이루는, 신뢰하고 돌아올 수 있는 전체 지식 자산 |
| 원본 | Source | Source | `sources` | 손대지 않고 들어온 원재료 |
| 초안 | Digest | Digest | (미구현) | Source를 사람이 읽기 좋게 정리한 것, 여기서 Statement가 추출된다 |
| 문장 | Sentence | Statement | `statements` | 결정이나 판단의 '왜'를 담는, 문장 크기의 가장 작은 단위 |
| 연결 | Connection | Relation | `statement_relations` | 두 Statement를 잇는, 방향을 가진 연결 |
| 레퍼런스 | Reference | Reference | (미구현) | Digest 틀에 안 맞지만 반복 참조되는 것을 위한 곳. 관련 입력이 들어올 때마다 새로 쌓이지 않고 기존 것이 다듬어진다 |
| 변경셋 | Changeset | Changeset | `changesets` / `changes` | Statement·Relation·Source·Digest·Reference에 대한 변경을 한 번에 묶는 단위 |

## 다시 꺼내기 — 어떻게 다시 찾고 보는가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 주제 | Topic | Topic | `topics` / `source_topics` | 재사용되는 라벨. Space 안에서만 재사용되며, 같은 라벨이 붙은 것들은 하나의 흐름으로 모인다 |
| 태그 | Tag | Tag | (미구현) | 재사용되는 라벨. Topic과 달리 Workspace 안에서 Space를 가로질러 재사용되고, 흐름을 만들지 않는다 |
| 스레드 | Thread | Thread | `topics` (주제 1개 = 스레드 1개) | 같은 Topic이 붙은 것들이 모여 이루는 하나의 흐름. 별도로 저장되지 않고, 필요할 때 계산되어 나타난다 |
| 해설 | Narration | Narration | Narration | Context를 근거로 질문에 답하는 산문. 근거에 없는 내용은 지어내지 않는다 |

## 소유·사람 — 누구의 것인가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 워크스페이스 | Workspace | Workspace | (미구현) | 사람과 결제를 묶는 계정 단위. 무엇이 보이고 안 보이는지는 여기서 정해지지 않는다 |
| 스페이스 | Space | Space | `spaces` / `space_members` | Workspace 안에서 여러 개 가질 수 있는, 일이나 관심사 단위로 나눠 담는 공간 |
| 유저 | User | User | (미구현) | 로그인하는 사람 단위 |
| 멤버 | Member | Member | (미구현) | 하나의 Space에 속한 User |

## 폐기된 용어

| 기존 용어 | 폐기 사유 |
|---|---|
| 맥락 = Context = Session (대화 공간) | "맥락"이 가리키던 대상 자체가 지식 자산 전체로 재정의됨. 대화 공간이라는 개념은 narration-design.md §9에서 무상태로 설계되어 실체가 없어짐 |
| 메시지 (Message), 챗 (Chat) | 위와 같은 이유로 v2에 없는 개념 |
| 개체 (Entity) | Reference로 흡수. "유형" 값(인물/조직/프로젝트 등) 중 하나로 표현 |
| 줄기 (Stem) | 스레드(Thread)로 대체됨 |
