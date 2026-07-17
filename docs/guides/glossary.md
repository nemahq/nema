# 용어 사전

제품 용어(사용자에게 노출)와 코드 용어(내부 구현)의 매핑.

> "개념 용어"는 코드·설계 문서에서 참조하는 내부 식별자, "코드 용어"는 실제 구현체. 구현이 없는 항목은 표시해둠.

**문서 어휘 원칙.** 제품 용어는 사용자 노출 카피 전용이다. 내부 설계 문서는 개념 용어의 굳어진 한국어 표기를 그대로 쓴다: Statement는 "진술", Relation은 "관계". Digest·Reference·Workspace는 겹치는 게 없어 문서에서도 "다이제스트"·"레퍼런스"·"워크스페이스"로 쓴다.

## 콘텐츠 — 무엇이 쌓이는가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 맥락 | Context | Context | (해당 없음, 파생 개념) | Statement와 Relation이 쌓여 이루는, 신뢰하고 돌아올 수 있는 전체 지식 자산 |
| 원본 | Source | Source | `sources` | 시스템이 손대지 않고, 사람이 작성한 그대로 보존하는 원재료 |
| 다이제스트 | Digest | Digest | `digests` / `digest_references` / `digest_links` | Source를 사람이 읽기 좋게 정리한 것, 여기서 Statement가 추출된다 |
| 문장 | Sentence | Statement | `statements` | 결정이나 판단의 '왜'를 담는, 문장 크기의 가장 작은 단위 |
| 연결 | Connection | Relation | `statement_relations` | 두 Statement를 잇는, 방향을 가진 연결 |
| 위키 | Wiki | Reference | `references` / `reference_links` / `statement_references` | Digest 틀에 안 맞지만 반복 참조되는 것을 위한 곳. 관련 입력이 들어올 때마다 새로 쌓이지 않고 기존 것이 다듬어진다 |
| 변경 | Change | Changeset | `changesets` / `changes` | 콘텐츠 단위들에 대한 변경을 한 번에 묶는 단위 |

- **표식**: Relation이 검색·해설 응답에서 Statement에 붙어 드러난 표시(대체·충돌·해소). 코드 `RelationMarkers`. Relation의 노출 형태이지 별도 단위가 아니다.

## 다시 꺼내기 — 어떻게 다시 찾고 보는가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 주제 | Topic | Topic | `topics` / `source_topics` | 재사용되는 라벨. Space 안에서만 재사용되며, 같은 라벨이 붙은 것들은 하나의 흐름으로 모인다 |
| 태그 | Tag | Tag | `tags` | 재사용되는 라벨. Topic과 달리 Workspace 안에서 Space를 가로질러 재사용되고, 흐름을 만들지 않는다 |
| 스레드 | Thread | Thread | `topics` (주제 1개 = 스레드 1개) | 같은 Topic이 붙은 것들이 모여 이루는 하나의 흐름. 별도로 저장되지 않고, 필요할 때 계산되어 나타난다 |
| 해설 | Narration | Narration | Narration | Context를 근거로 질문에 답하는 산문. 근거에 없는 내용은 지어내지 않는다 |

## 소유·사람 — 누구의 것인가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 워크스페이스 | Workspace | Workspace | `workspaces` / `workspace_members` | 사람과 결제를 묶는 계정 단위. 무엇이 보이고 안 보이는지는 여기서 정해지지 않는다 |
| 스페이스 | Space | Space | `spaces` / `space_members` | Workspace 안에서 여러 개 가질 수 있는, 일이나 관심사 단위로 나눠 담는 공간 |
| 유저 | User | User | (미구현) | 로그인하는 사람 단위 |
| 멤버 | Member | Member | (미구현) | 하나의 Space에 속한 User |

## 폐기된 용어

| 기존 용어 | 폐기 사유 |
|---|---|
| 맥락 = Context = Session (대화 공간) | "맥락"이 가리키던 대상 자체가 지식 자산 전체로 재정의됨. 해설은 질문마다 독립으로 답해, 대화 공간이라는 개념 자체가 필요 없어짐 |
| 메시지 (Message), 챗 (Chat) | 위와 같은 이유로 v2에 없는 개념 |
| 개체 (Entity) | Reference로 흡수. "유형" 값(인물/조직/프로젝트 등) 중 하나로 표현 |
| 줄기 (Stem) | 스레드(Thread)로 대체됨 |
| Draft (원본 승격 전 대기 글) = `drafts` 테이블·`draft.*` 라우터 | v2 모델엔 없는 자리. 날글은 손대지 않고 Source로 박제되고, 정리본은 그 뒤의 Digest가 맡는다. **엔티티로서의 Draft**만 폐기다(PR I-b에서 테이블·라우터·MCP 도구 제거). 일반어 "초안"은 살아 있다 — `open` 상태인 changeset의 확정 전 편집 상태(07-modeling.md "open은 확정 전 초안" 참고), changeset 없이 `pending`으로 남은 Source를 모으는 "초안" 화면(surface-inventory.md 참고)이 그 뜻으로 쓴다. v1의 "제출 전 대기 글"과는 다른 개념이니 혼동 주의 |
