# 용어 사전

제품 용어(사용자 노출)·개념 용어(코드·설계 문서의 내부 식별자)·코드 용어(실제 구현체)의 매핑.

**문서 어휘 원칙.** 내부 설계 문서는 개념 용어의 굳어진 한국어 표기를 그대로 쓴다: Statement는 "진술", Relation은 "관계". Digest·Reference·Workspace는 겹치는 게 없어 문서에서도 "다이제스트"·"레퍼런스"·"워크스페이스"로 쓴다.

## 콘텐츠 — 무엇이 쌓이는가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 맥락 | Context | Context | (해당 없음, 파생 개념) | Statement와 Relation이 쌓여 이루는, 신뢰하고 돌아올 수 있는 전체 지식 자산 |
| 원문 | Source | Source | `sources` | 시스템이 손대지 않고, 사람이 작성한 그대로 보존하는 원재료 |
| 다이제스트 | Digest | Digest | `digests` / `digest_references` / `digest_links` / `digest_topics` / `digest_tags` | Source를 사람이 읽기 좋게 정리한 것, 여기서 Statement가 추출된다 |
| 문장 | Sentence | Statement | `statements` | 결정이나 판단의 '왜'를 담는, 문장 크기의 가장 작은 단위 |
| 연결 | Connection | Relation | `statement_relations` | 두 Statement를 잇는, 방향을 가진 연결 |
| 레퍼런스 | Reference | Reference | `references` / `reference_links` / `statement_references` / `digest_references` | Digest 틀에 안 맞지만 반복 참조되는 것을 위한 곳. 관련 입력이 들어올 때마다 새로 쌓이지 않고 기존 것이 다듬어진다 |
| 변경사항 | Change | Changeset | `changesets` / `changes` | 콘텐츠 단위들에 대한 변경을 한 번에 묶는 단위 |

## 다시 꺼내기 — 어떻게 다시 찾고 보는가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 주제 | Topic | Topic | `topics` / `source_topics` / `digest_topics` | Space 안에서 재사용되는 라벨. 같은 라벨이 붙은 것들은 하나의 흐름으로 모인다 |
| 태그 | Tag | Tag | `tags` / `digest_tags` | Workspace 안에서 Space를 가로질러 재사용되는 라벨(Topic과 달리). 흐름은 만들지 않는다 |
| 스레드 | Thread | Thread | `topics` (주제 1개 = 스레드 1개) | 같은 Topic이 붙은 것들이 모여 이루는 하나의 흐름. 별도로 저장되지 않고, 필요할 때 계산되어 나타난다 |
| 해설 | Narration | Narration | Narration | Context를 근거로 질문에 답하는 산문. 근거에 없는 내용은 지어내지 않는다 |

## Tag 색상 — 코드 키와 표시 이름

Tag의 `color`(`TagColor`) 값은 DB enum·CSS 토큰(`--tag-sienna` 등)·Tailwind 클래스까지 물려 있어 코드 용어를 그대로 유지하고, 화면에 보이는 이름만 `TAG_COLOR_LABEL_KEY`(`apps/web/src/features/review/constants.ts`)를 거쳐 tolgee 문구로 바꾼다 — 위 표들의 "코드 용어 vs 제품 용어" 원칙을 색상에도 그대로 적용한 것. `color: "cyan"`인데 화면엔 "파랑"/"Blue"가 뜨는 게 정상이니, 코드에서 값을 보고 화면 이름과 다르다고 버그로 오인하지 않는다.

| 코드 용어 (`TagColor`) | 제품 용어 (한) | 제품 용어 (영) |
| --- | --- | --- |
| `sienna` | 갈색 | Brown |
| `cyan` | 파랑 | Blue |
| `sage` | 초록 | Green |
| `olive` | 노랑 | Yellow |
| `terracotta` | 주황 | Orange |
| `rose` | 분홍 | Pink |
| `mauve` | 마젠타 | Magenta |
| `violet` | 보라 | Purple |

## 소유·사람 — 누구의 것인가

| 제품 용어 (한) | 제품 용어 (영) | 개념 용어 | 코드 용어 | 역할 |
| -------------- | -------------- | --------- | --------- | ---- |
| 워크스페이스 | Workspace | Workspace | `workspaces` / `workspace_members` | 사람과 결제를 묶는 계정 단위. 무엇이 보이고 안 보이는지는 여기서 정해지지 않는다 |
| 스페이스 | Space | Space | `spaces` / `space_members` | Workspace 안에서 여러 개 가질 수 있는, 일이나 관심사 단위로 나눠 담는 공간 |
| 유저 | User | User | `auth.users`(Supabase Auth, 별도 모델링 안 함) / `profiles`(확장 필드) | 로그인하는 사람 단위 |
| 멤버 | Member | Member | `space_members` / `workspace_members` | 하나의 Space에 속한 User |

## 진입 — LNB(사이드바)에서 어디로 가는가

위에서 아래 순서: 홈 → 묻기 → 초안 → 워크스페이스(위키) → 스페이스(목록).

| 이름 | 코드 키 | 경로 | 역할 |
| --- | --- | --- | --- |
| 홈 | `common.home` | `/` | 로그인 후 기본 진입점. 모든 Space를 가로질러 Digest를 시간순으로 통합해 보여준다 |
| 묻기 | `workspace.ask` | (미출시) | 질문을 던지고 해설로 답을 받는 진입점. 아직 비활성이다("곧 지원 예정") |
| 초안 | `workspace.drafts` | `/drafts` | Changeset 없이 pending으로 남은 Source 카드 목록. 있을 때만 나타난다 |
| 워크스페이스 | `workspace.section_workspace` | 섹션 헤더(경로 없음), 하위 라우트 없음 | 하위에 위키를 둔다 |
| 위키 | `workspace.references` | `/wiki` | Reference를 모아 보여주는 화면 이름. Reference 자체를 가리키는 말이 아니다 |
| 스페이스 | `workspace.section_spaces` | 섹션 헤더(경로 없음), 하위 개별 Space는 `/space/$spacePublicId` | 하위에 사용자가 속한 Space 목록과 새 Space 생성을 둔다 |

## 폐기된 용어

| 기존 용어 | 폐기 사유 |
|---|---|
| 맥락 = Context = Session (대화 공간) | "맥락"이 가리키던 대상 자체가 지식 자산 전체로 재정의됨. 해설은 질문마다 독립으로 답해, 대화 공간이라는 개념 자체가 필요 없어짐 |
| 메시지 (Message), 챗 (Chat) | 위와 같은 이유로 v2에 없는 개념 |
| 개체 (Entity) | Reference로 흡수. "유형" 값(인물/조직/프로젝트 등) 중 하나로 표현 |
| 줄기 (Stem) | 스레드(Thread)로 대체됨 |
| Draft (원문 승격 전 대기 글) = `drafts` 테이블·`draft.*` 라우터 | **엔티티로서의 Draft**만 폐기다(v2 모델엔 없는 자리, PR I-b에서 테이블·라우터·MCP 도구 제거). 일반어 "초안"은 살아 있다 — `open` 상태 changeset의 확정 전 편집 상태(07-modeling.md "open은 확정 전 초안" 참고), LNB "초안" 화면(위 진입 표 참고)이 그 뜻으로 쓴다. v1의 "제출 전 대기 글"과는 다른 개념이니 혼동 주의 |
