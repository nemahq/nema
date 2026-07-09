# 기능 명세서: MVP 유저 플로우

> nema MVP의 기능을 유저 플로우(시나리오) 단위로 정의한다. 개발 진척·구현 가능 여부와 무관하게 MVP에 필요한 기능을 전부 나열하는 것이 목적이며, 추후 QA 문서로 재사용된다. 기술 설계·구현은 범위 밖이다. UI가 어떻게 생겼는지가 아니라 제품이 어떻게 동작하는지에 초점을 맞춘다(화면 생김새·시각 디자인은 wireframe·surface-inventory 몫).

### 함께 보는 문서

- 표면 인벤토리(`../surface-inventory.md`): 화면 목록과 각 역할.
- 표면 설계(`../surface-design.md`): 설계 원칙·리스크·나중으로 미룬 것.
- 와이어프레임(`../../../poc/mvp-wireframe.html`): 화면별 동작 근거 주석.

### 플로우 목록

| 문서 | 범위 |
| --- | --- |
| [넣기](intake-flow.md) | 사용자 입력 → Digest 추출 시작 (ingestion 완료 전) |
| [리뷰·후처리](review-flow.md) | 4개 changeset 타입(ingestion/relation/manual/revert) 전체의 리뷰·확정·버리기·되돌리기·되살리기 |
| [둘러보기](browsing-flow.md) | 스레드 피드 훑어보기, Digest 상세(평소 열람), Reference 목록/상세 |
| [꺼내기](retrieval-flow.md) | 묻기·해설 |
| [계정·워크스페이스 관리](workspace-account-flow.md) | 로그인, Space 생성, 계정 설정, MCP 연결 관리 |

### 시나리오 템플릿

각 플로우 문서의 시나리오는 다음 형식을 따른다:

- **Given** — 전제조건
- **When** — 트리거(사용자 행동)
- **Then** — 기대 결과 (확인 가능한 조건문 — QA 체크리스트로 그대로 재사용). 결과가 2개 이상이면 번호 매긴 목록으로 쓴다. 결과가 1개뿐이면 한 문장으로 둔다
- **관여 화면** — surface-inventory 화면명 참조 (화면 자체의 생김새는 서술하지 않음)
