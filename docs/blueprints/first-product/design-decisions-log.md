# 디자인 결정 로그

이 문서는 프런트엔드 구현 세션 간에 시각·패턴 일관성을 유지하기 위한 누적 기록이다. MVP IA 재구축(`docs/poc/mvp-wireframe.html`, `docs/blueprints/first-product/functional-spec/`)은 여러 세션에 걸쳐 화면 단위로 진행되는데, 세션마다 매번 "재사용 가능한 게 뭐가 있었지"를 처음부터 다시 조사하면 세션 간 스타일이 갈라지고 같은 판단을 반복하게 된다.

**규칙**: 화면·플로우 구현을 마무리하는 세션은 작업을 끝내기 전에 이 문서 맨 아래에 새 항목을 추가한다 — 어떤 weave/v1 컴포넌트·토큰을 재사용했는지, 새로 만든 프리미티브가 있다면 무엇이고 왜 기존 것으로 안 됐는지를 남긴다. 항목은 시간순으로 쌓이며, 이전 항목을 고치지 않고 새로 추가만 한다(append-only). 뒤 세션은 착수 전에 이 문서를 훑어 이미 내려진 결정을 재도출하지 않는다.

---

## 베이스라인 (기존 자산 인벤토리)

> 아래는 특정 세션의 판단이 아니라, MVP 재구축을 시작하는 시점에 "이미 있는 것"을 감사(audit)한 결과다. 최초 작성: 2026-07-10.

### 1. `@nema-io/weave` — 공유 디자인 시스템 패키지

`packages/weave` (`@nema-io/weave`). `apps/web`이 workspace 의존성으로 가져다 쓰며, 실제로 55개 파일에서 import 중 — 이미 적극적으로 쓰이고 있는 살아있는 패키지다.

- **토큰** (`src/tokens/index.css`): 3계층 구조 — palette(원시 hex) → semantic(역할 기반, `--brand`/`--surface-*`/`--fg-*`/`--status-*`/`--border`) → Tailwind `@theme inline` 매핑. 라이트/다크는 `.dark` 클래스로 전환, `.theme-inverted`(다크와 값은 같지만 "반전 테마 ≠ 다크 테마" 가능성을 의도적으로 분리)도 있음. `duration`·`ease` 토큰(트랜지션)까지 포함. **spacing·radius·typography 스케일 전용 토큰은 없음** — Tailwind 기본 스케일을 그대로 쓰는 것으로 보임(별도 확인 필요). 폰트는 Satoshi/Wanted Sans/Geist Mono를 CDN `@import`.
- **컴포넌트** (`src/components/`, `src/index.ts`에서 export): Alert, Avatar, Badge, Button(`buttonVariants` CVA 포함), Card(+Header/Title/Description/Content/Footer/Action), Checkbox, Dialog(Radix 기반, 풀 서브컴포넌트), DropdownMenu(Radix), Form(FormField/FormMessage), Input, Kbd, Label, ScrollArea, Select(Radix), Separator, Skeleton, Text, Toast(sonner 기반), Tooltip(Radix). 아이콘은 `@nema-io/weave/icons`(lucide-react 재노출). Radix 기반이라 접근성·키보드 상호작용은 기본 확보.
- **없는 것**: 모달 외의 복합 패턴(예: 사이드 패널/사이드뷰 탭 시스템, diff 뷰어, 채팅형 인풋, split-pane), 도메인 특화 컴포넌트(Digest 카드, 관계 판정 카드 등)는 당연히 weave에 없음 — weave는 범용 프리미티브 레이어까지만 담당.

### 2. `apps/web` 자체 재사용 레이어

- **전역 CSS** (`apps/web/src/index.css`): weave 스타일을 import하고, 앱 도메인 전용 매핑만 추가(`--color-mode-remember`/`--color-mode-ask` — 넣기/묻기 모드 색상을 weave 팔레트의 indigo/orange에 연결). 별도 tailwind.config 없음(Tailwind v4 CSS-first 설정).
- **`components/ui/`** (2개 이상 feature에서 쓰는 것만 승격, `apps/web/CLAUDE.md` 원칙):
  - `ChatInput.tsx` — 자동 확장 textarea + 제출 버튼, `MAX_TEXTAREA_HEIGHT_PX` 이후 내부 스크롤, Enter 제출/Shift+Enter 줄바꿈, 스트리밍 중 정지 버튼 전환. **와이어프레임의 "넣기" 인라인 인풋(Space 오버뷰·홈)이 요구하는 동작(자동 확장→최대 높이→내부 스크롤)과 정확히 일치** — 그대로 재사용 가능해 보임(모드 색상·placeholder만 스와핑).
  - `TabbedPanel.tsx` / `TabbedPanelLayout.tsx` — 탭 헤더 + 스크롤 콘텐츠 영역 레이아웃. 와이어프레임의 "사이드뷰 여러 탭 동시 열기"(Digest 상세·Reference 상세 공유 탭 시스템) 요구사항과 구조가 유사 — 탭 추가/전환/닫기 로직은 지금 retrieval 탭 전용이라 다중 엔티티 탭(Digest/Reference/원문)으로 일반화하는 확장 작업 필요.
  - `split/` (SplitContainer, ResizeHandle, tree-ops) — 리사이즈 가능한 분할 레이아웃. 현재 ContentPanel/ChatPanel 2분할에 쓰이는데, Digest 리뷰 화면의 "본문 + 원문 대조 사이드 패널" 같은 구조에 재사용 여지 있음.
- **`components/layout/`**: `Sidebar.tsx`가 접기/펼치기, top/footer 슬롯, localStorage 영속 상태를 갖춘 셸 — 와이어프레임 LNB(Workspace/홈/묻기·해설/Reference/Space 목록)의 뼈대로 바로 재사용 가능해 보임(현재 콘텐츠는 세션 리스트 전용이라 내부 네비게이션 항목만 교체하면 됨).
- **`features/dev-harness/`**: **주의 — 코드 주석에 "내부 테스트 조종석(NEM-125·153), 제품 화면이 아니다"로 명시됨.** 진술 엔진(넣기·검색)·관계 판정·검토함(리뷰)·이력을 실입력으로 검증하기 위한 엔지니어링 도구. `DigestReviewCard`, `RelationCard`, `PendingRelationCard`, `ChangesetRow`, `RelationMarkers`, `StatementRelationLine`, `SourceCard`, `SourceComposer` 등 MVP 화면(Digest 리뷰, 관계 판정, 변경셋)과 이름·역할이 거의 1:1로 대응하지만, 실제 마크업은 순수 `<input>`/보더 박스 수준(예: `DigestReviewCard`는 라벨 없는 plain input 필드 나열)이라 **시각적으로는 재사용 불가, 새로 디자인해야 함**. 다만 이 폴더의 **훅 레이어**(`useDigestReviewQuery`, `useConfirmReview`, `useUpdateReview`, `useActiveRelationsQuery`, `usePendingRelationListQuery`, `useApplyPendingRelation`, `useRejectPendingRelation`, `useRevertChangeset` 등)는 tRPC 연동과 데이터 셰이프가 이미 검증되어 있어 **로직 레이어는 그대로 갖다 쓸 확률이 높음** — 화면 재구축 시 UI만 새로 짜고 훅은 재사용하는 방향을 우선 검토할 것.

### 3. 화면 그룹별 재사용 가능성 (와이어프레임 `screen-*` 기준)

| 화면 그룹 | 재사용 가능성 | 근거 |
| --- | --- | --- |
| 로그인 (`screen-login`) | 부분 재사용 | weave Button/Input/Card로 조립 가능한 단순 폼. 새 레이아웃 필요하지만 프리미티브는 충분. |
| LNB / 전역 셸 | 대부분 재사용 | `Sidebar.tsx` 뼈대(접기·슬롯·영속 상태) 그대로 사용, 내부 네비게이션 항목만 신규 구성(홈·묻기해설·Reference·Space 목록). |
| 홈 / Space 오버뷰(스레드 탭) | 부분 재사용 | `ChatInput`(넣기 인풋), weave Card/Badge(피드 카드)는 재사용 가능. 무한 스크롤 피드, Topic 필터, "오래된 판단" 토글, Space 셀렉트 컴포넌트는 새로 설계·구현 필요. |
| 묻기·해설 (`screen-ask-narrate`) | 부분 재사용 | `ChatInput` 재사용 가능(모드 색상 전환 로직 이미 있음 `chatModeConfig.ts`). `RetrievalMessage`/`SearchResultsList`(session 기능) 등 검색 결과 렌더링 컴포넌트가 있어 참고 가능하나 최종 UI는 와이어프레임 기준 재작업 필요. |
| Reference 목록/상세 (`screen-reference-list`) | 새 디자인 필요 | 대응하는 v1/weave 컴포넌트 없음. `TabbedPanel` 사이드뷰 패턴만 구조적으로 참고. |
| 초안 (`screen-drafts`) | 새 디자인 필요 | dev-harness `PendingSourceList`/`SourceCard`가 데이터 흐름 참고는 되나 시각 요소는 새로 필요. |
| Digest 리뷰 화면 (`screen-digest-review`) | 로직 재사용, UI 새로 필요 | dev-harness `DigestReviewCard`/`ReviewPanel` + 훅(`useDigestReviewQuery` 등)이 API 계약을 이미 검증. 문서형 카드 UI(`digest-readonly`, diff 하이라이트, @ 멘션)는 신규 구현. |
| 변경셋 / Changeset 상세 (`screen-changeset-detail`) | 로직 일부 재사용, UI 새로 필요 | dev-harness `ChangesetRow`/`useChangesetListQuery`/`useRevertChangeset` 참고 가능. Open/Closed 서브탭, outcome/타입 배지 조합은 신규. |
| 관계 판정 / 관계 병합 (`screen-relation-judgment`, `screen-relation-merge`) | 로직 재사용, UI 새로 필요 | dev-harness `PendingRelationCard`/`RelationCard`/`RelationMarkers`/`StatementRelationLine` + 훅(`useApplyPendingRelation`, `useRejectPendingRelation`)이 핵심 로직 검증 완료. A/B 카드 선택 UI, 병합 diff 뷰는 신규. |
| Digest 상세 사이드 패널 | 새 디자인 필요 | `TabbedPanel`/`split/`가 구조적 기반은 제공하지만 "여러 엔티티 탭 + 원문 대조 + 판정 대기 배너" 조합은 신규 설계. |

---
