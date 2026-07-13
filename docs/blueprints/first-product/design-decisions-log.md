# 디자인 결정 로그

이 문서는 프런트엔드 구현 세션 간에 시각·패턴 일관성을 유지하기 위한 누적 기록이다. MVP IA 재구축(`docs/poc/mvp-wireframe.html`, `docs/blueprints/first-product/functional-spec/`)은 여러 세션에 걸쳐 화면 단위로 진행되는데, 세션마다 매번 "재사용 가능한 게 뭐가 있었지"를 처음부터 다시 조사하면 세션 간 스타일이 갈라지고 같은 판단을 반복하게 된다.

**규칙**: 화면·플로우 구현을 마무리하는 세션은 작업을 끝내기 전에 이 문서 맨 아래에 새 항목을 추가한다 — 어떤 weave/v1 컴포넌트·토큰을 재사용했는지, 새로 만든 프리미티브가 있다면 무엇이고 왜 기존 것으로 안 됐는지를 남긴다. 항목은 시간순으로 쌓이며, 이전 항목을 고치지 않고 새로 추가만 한다(append-only). 뒤 세션은 착수 전에 이 문서를 훑어 이미 내려진 결정을 재도출하지 않는다.

**작성 스코프(2026-07-13 정리)**: 남기는 건 **확정된 규칙과 그 이유**다 — "group-hover 안 쓰면 배경이 죽는다", "danger 톤은 두 군데 따로 선언돼 있다" 같이 안 남기면 다음 세션이 똑같이 재발견해야 하는 것들. **"어떤 라운드를 거쳐 이 결론에 왔는지"(누가 뭘 요청했다가 리뷰에서 바뀌었다는 식의 서사)는 웬만하면 줄인다** — 그건 PR 리뷰 스레드·커밋 히스토리가 원래 담당할 정보고, 여기 계속 쌓이면 문서가 길어질수록 진짜 규칙이 서사에 묻혀 "먼저 읽기"의 신호 대 잡음비가 나빠진다. 백엔드/데이터 아키텍처 판단(쿼리 invalidate 전략, 마이그레이션 안전성 등)은 이 문서(FE 시각·패턴 전용) 스코프 밖 — 결정된 게 아니라 논의만 한 것이면 아예 안 남기고(필요해지면 그때 PR에서 근거로 남김), 결정까지 됐다면 `product-decisions-log.md` 쪽이 더 맞는 자리인지 먼저 확인한다. 기존 항목은 소급 정리하지 않는다(위 append-only 원칙).

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

## 세션 기록

### 2026-07-10 — 로그인: 매직링크 만료·재사용 오류

`workspace-account-flow.md`의 "매직링크 만료·재사용 오류" 케이스(구현 갭)만 처리. 매직링크 로그인 발송·메일 대기 상태·이메일 형식 오류는 이전 세션에서 이미 구현되어 있었음.

- 새 컴포넌트/토큰 없음. `SignInPage.tsx`의 기존 에러 상태(`error`)와 `role="alert"` 표시 영역을 그대로 재사용.
- 번역키 `auth.magic_link_invalid` 추가(en/ko 라이팅 모두 작성, `docs/guides/ux-writing.md` 톤 적용, 원인+해결 안내 구조).
- 라이트/다크 모드 모두 브라우저로 직접 확인.
- **리뷰 반영**: 처음 구현은 `SignInPage` 마운트 시 `window.location.hash`를 읽는 방식이었는데, 실제 매직링크 클릭 흐름에서는 `/`가 보호 라우트라 `requireAuth`(`guards.ts`)가 `location.href`(해시 포함)를 통째로 `/signin?redirect=...` 쿼리로 인코딩해버려 `SignInPage`가 마운트될 땐 이미 해시가 사라진 뒤였음(브라우저 재현으로 확인). 해시를 라우터 `beforeLoad`보다 먼저, 즉 모듈 로드 시점에 캡처하도록 `lib/auth/index.tsx`로 옮김. 또한 해시 존재 여부만으로 판단하면 구글 로그인 취소·거부(`access_denied`)까지 매직링크 오류로 오분류하는 회귀가 있어 `error_code === "otp_expired"`일 때만 노출하도록 좁힘 — `access_denied`는 조용히 무시, 그 외 예기치 않은 코드는 Sentry로 보냄(`apps/web/CLAUDE.md` "Errors go to Sentry").

---

### 2026-07-10 — 신규 유저 랜딩: LNB 골격 + Space 오버뷰 + 인증 후 라우팅 분기

`workspace-account-flow.md`의 "신규 유저 최초 로그인(Space 없음)" 흐름. v2 IA의 새 LNB 골격을 처음 얹는 작업이라, 이후 화면들(묻기·해설, Reference, 홈 재구축 등)이 이 위에 쌓인다. BE의 `workspace.bootstrap` 쿼리와 한 슬라이스로 묶어 통합했다(초안 단계에선 계약 목업으로 진행했으나 실 쿼리로 스왑 완료).

- **골격 구조(과도기 공존)**: 새 LNB(`WorkspaceSidebar`)를 기존 `_sessionSidebar`와 **형제인 새 레이아웃 라우트 `_workspaceSidebar`**로 추가하고, 그 아래 `/space/$spaceId`(기존 `/session/$sessionId` 미러)를 얹었다. 기존 세션 사이드바·홈(`/`)은 **건드리지 않음** — 지침 "기존 유저→홈 경로는 이미 동작, 재사용". MVP IA 재구축이 화면 단위 점진 마이그레이션이라, 새 유저는 새 LNB(Space 오버뷰)·기존 유저는 옛 홈+옛 사이드바를 보는 이원 상태가 **의도된 과도기**다(세션 개념·옛 홈을 새 LNB 아래로 옮기고 옛 사이드바를 걷어내는 건 후속 슬라이스).
- **LNB에 홈 항목은 뺐다(PM 확정)**: 킥오프 LNB 항목 목록이 홈을 빼고 있고, 홈(`/`)이 아직 옛 사이드바 세계라 새 LNB에서 홈을 누르면 사이드바가 통째로 바뀌는 어색함이 생긴다. 홈은 v2 홈 화면을 새 LNB 아래로 옮기는 슬라이스에서 함께 붙인다.
- **재사용**: `Sidebar.tsx`(셸: 접기·슬롯·localStorage 영속) 그대로 재사용, 내부 네비게이션만 새로 구성. `SidebarNavLink`에 param 라우트용 선택적 `params` prop만 하위호환 추가(Space 링크가 `/space/$spaceId` 이동에 필요). 계정 드롭다운(`WorkspaceMenu`)은 기존 `UserMenu` 패턴·`SettingsModal`(public API)·로그아웃 로직을 그대로 따르되, 트리거를 최상단 워크스페이스 이름으로 옮기고 프로필(아바타·이름·이메일)을 드롭다운 안으로 넣음(surface-inventory "계정 설정 오버레이"). 빈 상태 페인트 마크는 `NemaMarkIcon` + `TabbedPanel`의 opacity 관례(`opacity-[0.06] dark:opacity-[0.08]`) 재사용. weave `Skeleton`으로 로딩 자리(스피너 금지 관례).
- **신규 컴포넌트(한 파일 한 컴포넌트 관례로 분리)**: `WorkspaceSidebar`(LNB 레이아웃, 데이터 미조회·조합만) + `WorkspaceMenuSlot`/`SpaceList`(각자 bootstrap 훅 직접 소유) + `WorkspaceMenu`(계정 드롭다운) + `LnbSection`/`LnbPlaceholderItem`(묻기·해설/Reference/새 Space — 대상 화면이 후속 슬라이스라 비활성+"곧" 툴팁, 죽은 링크보다 정직), `SpaceOverview`(스레드/변경셋 2탭 + 빈 상태) + `SpaceTabButton`/`SpaceEmptyState`, `WorkspaceBootstrapGate`(라우팅 분기). `SpaceOverviewPage`는 얇은 페이지로 `SpaceOverview`만 렌더. weave/기존 앱에 대응물이 없어 신규.
- **라우팅 분기**: `WorkspaceBootstrapGate`를 `AppLayout`에 `OnboardingGate`와 나란히 두고, bootstrap의 **`isFirstEntry`**(profiles 첫 진입 표식 — 가입 트리거가 Space를 미리 만들어 "Space 존재"로는 신규를 못 가름) && `pathname==="/"`일 때만 `spaces[0]` 오버뷰로 `replace` 이동(1회, `useRef` 가드). **기존 유저 무간섭은 BE 마이그레이션의 `first_entered_at` 백필로 보장된다** — 백필이 없으면 배포 후 첫 진입에서 기존 가입자 전원이 신규로 오분류돼 오리다이렉트되므로, 마이그레이션이 기존 가입자(프로필 행 유무 무관)를 백필한다.
- **bootstrap 실 연동**: `useWorkspaceBootstrapQuery`가 `trpc.workspace.bootstrap.useQuery`를 감싼다(output `{user, workspace, spaces, isFirstEntry}`). Space 기본 이름 en placeholder는 **`"Default"`**(BE `DEFAULT_SPACE_NAME`과 일치, 마지막 ko UX 패스 재검토 대상).
- **bootstrap 실패 처리**: `_workspaceSidebar` 셸(`WorkspaceSidebarLayout`)이 `isError`면 error를 throw → 라우트 `errorComponent`(`RouteErrorFallback`)로 올린다 — 반쪽 렌더(빈 계정 메뉴·Space 0개 착시·에러를 "Space 없음"으로 오표시)를 막고 재시도 UI를 재활용. Sentry 보고는 전역 `queryCache.onError`가 TRPCClientError를 제외하므로 쿼리 `meta.reportToSentry`로 opt-in. 게이트(AppLayout, 모든 인증 라우트)는 tolerant 유지(실패=리다이렉트 안 함, 세션 페이지 무영향).
- **용어**: Thread 코드 식별자는 코드 용어 `topic`으로(i18n 키 `space.tab_topic`/`space.topic_empty`, `SpaceTab` 타입), 사용자 라벨 "Thread"는 유지(글로서리 제품/코드 용어 분리).
- **i18n**: 지침대로 en 채우고 ko는 en과 동일 값(자리만) — `space.*`(tab_topic/tab_changesets/topic_empty/changesets_empty/not_found), `workspace.*`(ask/references/section_workspace/section_spaces/new_space/coming_soon). 섹션 라벨은 문장 케이스 값(`Workspace`/`Spaces`) + CSS `uppercase`(값에 대문자 박지 않음). 홈은 기존 `common.home` 재사용. ko 라이팅은 후속 UX 패스 몫.
- **스페이싱/타이포 토큰 — 이번엔 안 만듦(판단 위임받아 결정)**: weave엔 색상·duration 토큰만 있고 스페이싱/타이포 전용 토큰이 없지만, 앱 전체가 이미 **Tailwind 기본 스케일 직접 사용 + weave 색상/모션 토큰**으로 일관돼 있다(이 화면들도 그 어휘를 그대로 따름). 지금 2개 화면에만 새 토큰을 도입하면 나머지 앱과 갈라져 오히려 불일치를 만든다 — 스페이싱/타이포 토큰은 앱 전역에 한 번에 적용하는 **전용 파운데이션 슬라이스**의 일이다. 화면 간 어긋남은 토큰이 아니라 이웃 화면에 맞춘 Tailwind 클래스로 잡는다. 라이트/다크 브라우저 확인에서 시스템적 불일치 없음.
- 라이트/다크 둘 다 브라우저로 직접 확인(LNB 펼침·접힘, 워크스페이스 드롭다운, 탭 전환/빈 상태 문구 변화, bootstrap 실패 시 라우트 에러 폴백). 실제 인증 해피패스(신규→Space 리다이렉트)는 스테이징 마이그레이션 적용 후 검증 — 스키마가 스테이징 DB에 도달하는 타이밍이 머지 이후라서다.

---

### 2026-07-10 — 계정 설정: 설정 모달 2단 재구조화 + Theme 토글 + 계정 삭제

`workspace-account-flow.md`의 "계정 설정" 섹션 — 로그아웃·UI 언어 변경(기존 구현 무변경) 제외, Theme 노출·설정 모달 2단 재구조화·계정 삭제 3분기 전체가 이번 슬라이스. 백엔드(`account-router`/`account-service`)는 이전 세션에서 이미 완비돼 있어 순수 프론트엔드 슬라이스로 진행.

- **설정 모달 골격 신규 작성(재사용 아님)**: surface-inventory가 "Digest·Reference 변경 이력 모달과 같은 골격(목록 클릭 시 콘텐츠만 갱신)을 재사용하되 배치는 반대라 클래스는 새로 선언"이라 지시했지만, 감사 결과 그 "변경 이력" 모달은 Digest 상세 사이드 패널(아직 미구현, baseline 인벤토리 "새 디자인 필요")에 속해 코드에 존재하지 않았다 — 재사용할 기존 컴포넌트가 실제로 없어 `SettingsNav`(좌측 내비)+`GeneralSection`/`AccountSection`(우측 콘텐츠, 섹션 전환 시 우측만 갱신)을 새로 작성했다. 패턴만 문서 설명대로(좌측 내비 클릭 → 우측 콘텐츠만 교체, 열릴 때마다 "일반"부터) 따르고 코드 복붙은 없음. 나중에 "변경 이력" 모달을 실제로 만들 때 이 골격(좌우 어느 쪽이 내비인지만 반대)을 참고할 수 있다.
- **`SettingsModal`**: `DialogContent`를 `md:max-w-2xl p-0 gap-0`으로 오버라이드하고 내부에서 `flex h-[520px]` 컨테이너로 좌(`SettingsNav`, `w-40`)/우(콘텐츠, `flex-1 overflow-y-auto`)를 나눈다. `section` state는 모달이 닫힐 때(`onOpenChange(false)`)마다 `"general"`로 리셋 — 재오픈 시 항상 "일반"부터 보인다는 요구를 로컬 state 초기화로 구현(언마운트 후 재마운트가 아니라 같은 인스턴스가 재사용되는 `WorkspaceMenu`/`UserMenu` 양쪽 진입점 모두에서 성립해야 하므로).
- **`GeneralSection`**: 기존 `SettingsForm`(앱 언어 Select + `ContentLanguageSection`, Save 클릭 시에만 `changeLocale` 반영)을 그대로 이관 — 로직 변경 없음, 위치만 "일반" 섹션 안으로. `ContentLanguageSection`은 surface-inventory의 "일반" 섹션 설명(Theme+앱 언어)엔 없지만 계정 섹션에도 속하지 않는 언어 축이라 일반 섹션에 남김(별도 섹션을 새로 만들 정도는 아니라고 판단, PM 확인 필요 항목으로 아래 남김). `ThemeToggle`을 그 위에 추가 — Save 게이팅 없이 클릭 즉시 `useTheme().setTheme()` 호출(기존 `theme.ts`/`ThemeProvider`가 이미 즉시 반영+영속화를 갖추고 있어 그대로 사용, 새 로직 없음).
- **`ThemeToggle`**: `role="radiogroup"`+`role="radio"` 3버튼(Sun/Moon/Monitor 아이콘, `lucide-react`) 세그먼트 컨트롤 신규 작성 — DevToolbar의 임시 토글(`toggleClass`)은 프로덕션 노출용이 아니라 재사용하지 않고 weave 톤(surface-raised 배경, active 시 surface-card+shadow)으로 새로 작성.
- **계정 삭제 흐름**: `AccountSection`(프로필 표시+삭제 진입점) → 클릭 시 `AccountDeleteFlow`로 전환(모달 안 로컬 step 전환, 별도 다이얼로그 중첩 없음). `AccountDeleteFlow` 진입 즉시 `useAccountDeletionBlockersQuery`(`trpc.account.deletionBlockers`)를 호출해 게이팅부터 계산:
  - `blockingWorkspaceIds.length > 0` → 이전 필요 안내 + "뒤로"(계정 섹션 복귀)만 제공, 삭제 액션 자체를 렌더링하지 않음(케이스 "계정 삭제 차단").
  - 0이면 확인 화면(위험 액션 Alert + Cancel/"Yes, delete my account") 렌더 — Cancel은 계정 섹션으로 복귀만 하고 아무 요청도 보내지 않는다(케이스 "계정 삭제 취소").
  - 확인 클릭 시 `trpc.account.delete`(`useDeleteAccount`) 호출 → 성공 시 `UserMenu`와 동일한 로그아웃 패턴(`supabase.auth.signOut()` → `/signin` navigate) 재사용. 서버가 레이스로 `PRECONDITION_FAILED`를 던지면(확인 화면을 보여준 뒤 다른 워크스페이스가 새로 생기는 등) `blockersQuery.refetch()`로 게이팅 화면으로 되돌리고, 그 외 에러는 인라인 `Alert`로 노출(전역 토스트는 `meta.skipGlobalToast`로 꺼서 이 화면의 인라인 처리와 중복되지 않게 함).
- **확인 강도 — 버튼 확인 채택(미확정 항목, PM 확인 필요)**: 명세서는 "확인 단계를 거치는 위험 액션"이라고만 하고 강도(버튼 vs 타이핑)를 정하지 않았다. weave에 타이핑 확인 컴포넌트가 없고, 계정 삭제가 이번 슬라이스에서 유일한 "가장 위험한" 액션이라 과설계보다 명확한 경고 문구(Alert, "This permanently deletes your account and can't be undone")를 얹은 버튼 confirm으로 기본값을 잡았다. Space 삭제(다른 미확정 케이스)가 버튼 확인으로 정해지면 이 결정을 그대로 따르면 되고, 타이핑 확인 쪽으로 정해지면 이 화면도 맞춰 강화해야 한다.
- **차단 워크스페이스 목록 — 개수만 표시, 이름 없음(백엔드 갭 발견)**: `getAccountDeletionBlockers`는 `blockingWorkspaceIds: string[]`(UUID)만 반환하고 이름을 안 준다. UUID를 그대로 나열하면 오히려 신뢰를 깨뜨려, "N개 워크스페이스"라는 개수 안내로 낮췄다(어느 워크스페이스인지는 지금 이 화면에서 특정할 수 없음). 게다가 앱 어디에도 소유권 이전 UI가 아직 없어(검색 결과 0건) 이 게이팅에 걸린 유저는 현재 막다른 길이다 — 백엔드에 워크스페이스 이름을 포함하도록 확장하고, 소유권 이전 화면을 별도로 만드는 후속 작업이 필요하다(이번 슬라이스는 지침대로 백엔드 미변경).
- **재사용**: weave `Dialog`/`DialogContent`/`DialogFooter`/`Alert`/`Button`(`danger` variant)/`Skeleton`(스피너 금지 관례)/`Avatar`. 프로필 표시는 `WorkspaceMenu`의 아바타+이름+이메일 블록과 같은 마크업 어휘를 따름(컴포넌트 자체는 공유하지 않음, 각자 다른 용도의 작은 블록이라 추출할 정도는 아니라고 판단).
- **i18n**: 지침대로 en만 실작성, ko는 en과 동일 값(자리만) — 신규 `account.*` 네임스페이스(계정 삭제 전용) + 기존 `settings.*`에 `nav_general`/`nav_account`/`theme`/`theme_description` 추가. 기존 죽은 키 `settings.theme_dark`/`theme_light`/`theme_system`을 `ThemeToggle`에 연결.
- 라이트/다크 모두 브라우저로 직접 확인(Theme 토글 3종 즉시 반영+새로고침 후 유지, 설정 모달 재오픈 시 "일반" 기본 노출, 계정 섹션→삭제 확인→취소 왕복). 계정 삭제 게이팅·확인 화면은 Kyle 실계정(현재 유일-멤버 워크스페이스만 있어 차단 없음)으로 게이팅 통과·확인 화면 렌더링까지만 확인했고, **"Yes, delete my account" 실제 클릭(실제 삭제 실행)은 하지 않았다** — 실제 삭제 실행·차단 문구(다른 멤버 있는 워크스페이스의 유일 owner 케이스)는 이번 세션에서 검증 못함, 일회용 테스트 계정으로 별도 검증 필요.

---

### 2026-07-10 — 계정 설정 리뷰 반영: 삭제 확인 타이핑화 + ContentLanguageSection 숨김

PM 리뷰 핑퐁 결과 반영, PR #380에 같은 브랜치로 추가 커밋. 위 세션에서 "확인 강도 미확정"으로 남겨뒀던 판단이 타이핑 확인으로 확정됐고, ContentLanguageSection의 "일반" 섹션 배치가 애매하다고 남겨뒀던 질문은 "숨김"으로 정리됐다.

- **계정 삭제 확인 — 버튼 확인 → 타이핑 확인으로 강화**: `AccountDeleteFlow`의 확인 화면에 이메일 입력 필드를 추가했다. 값은 별도 API 호출 없이 이미 인증된 세션에서 온 `useUser().email`을 `AccountSection` → `AccountDeleteFlow`로 그대로 내려받는다(`AccountSection`이 이미 프로필 블록 표시에 같은 값을 쓰고 있어 자연스러운 prop). 비교는 `input.trim().toLowerCase() === userEmail.trim().toLowerCase()` — 이메일은 로컬파트까지 대소문자를 구분하는 게 RFC상 원칙이지만, 실사용에서 대부분의 메일 서버·서비스가 대소문자를 구분하지 않고 사용자도 자기 이메일의 대소문자를 정확히 기억하지 못하는 경우가 흔해(입력 재현성이 오히려 삭제를 막는 마찰이 됨) 대소문자 무시로 정했다. `Yes, delete my account` 버튼은 이 비교가 참일 때만 활성화되고, 그 외 취소·`PRECONDITION_FAILED` 방어 로직은 그대로 유지했다(요청 범위와 일치).
- **ContentLanguageSection 숨김 + 완전 삭제**: `GeneralSection`에서 렌더링을 뺐다(surface-inventory의 "일반" 섹션 정의가 애초에 Theme+앱 언어만 언급하고 있었던 것과 이제 합치). `profiles.content_language` DB 값·서버 로직은 지침대로 손대지 않았다 — 죽은 시그널로 유지한다는 기존 결정(project memory)은 그대로다. 렌더링을 빼고 나니 `ContentLanguageSection.tsx`가 다른 어디서도 안 쓰여(온보딩은 같은 `ContentLanguage` 타입을 쓰지만 별도의 자체 셀렉트 UI를 갖고 있어 이 컴포넌트에 의존하지 않았다) CLAUDE.md 원칙대로 파일 자체를 삭제했다. **연쇄적으로 죽은 코드도 같이 정리**: `GeneralSection`이 `ContentLanguageSection`에 값을 넘기려고만 쓰던 `useProfileSuspenseQuery`/`useUpdateProfile`/`contentLang` state가 그 용도를 잃어, 남겨두면 Save를 누를 때마다 값이 안 바뀐 `contentLanguage`를 서버에 조용히 재제출하는 죽은 왕복 호출만 남는 상황이었다 — 이 부분도 들어내고 `handleSave`를 `changeLocale(appLang)` 한 줄로 단순화했다(UI 언어 변경 자체의 동작·타이밍은 그대로, "Save 클릭 시 반영"도 안 바뀜). 이 정리로 `useProfileSuspenseQuery`가 앱 전체에서 미사용이 돼(knip이 잡음) `features/profile`에서도 함께 제거했다 — `useProfileQuery`/`useUpdateProfile`은 온보딩이 계속 쓰고 있어 남겼다. `settings.content_language`/`content_language_description` i18n 키도 유일한 소비처가 사라져 함께 삭제했다.
- **i18n**: `account.delete_confirm_email_label`(en: `"Type {email} to confirm"`) 신규 추가, ko는 지침대로 en과 동일 값(자리만).
- 라이트/다크 모두 브라우저로 직접 확인 — 잘못된 이메일 입력 시 버튼 비활성 유지, 앞뒤 공백·대소문자가 다른 정확한 이메일 입력 시 버튼이 활성화로 전환되는 것, 일반 섹션에 ContentLanguageSection이 더 이상 안 보이는 것까지 확인했다. Kyle 실계정 보호를 위해 활성화된 버튼을 실제로 누르는 것(실제 삭제 실행)은 여전히 하지 않았다.

---

### 2026-07-10 — 설정 모달 시각 폴리싱: Notion/Tiro 레퍼런스 + 업계 표준 정렬

PM이 Notion 설정 모달(라벨+설명/컨트롤 한 줄 정렬, 절제된 danger 톤)·Tiro 설정 모달(좌측 내비)·Linear 사이드바·SaaS 설정 UX 리서치를 레퍼런스로 주고 확정한 디자인 결정을 그대로 반영한 순수 레이아웃 패스(로직 무변경). 카드형 그룹핑(Tiro)과 내비 카테고리 헤더는 지금 항목 수(일반/계정 2개)엔 과하다고 판단해 채택하지 않음 — flat row + divider로 통일.

- **모달 셸 확대**: `SettingsModal`의 `DialogContent`를 `md:max-w-2xl`→`md:max-w-3xl`, 콘텐츠 높이 `h-[520px]`→`h-[560px]`. `SettingsNav`는 `w-40`→`w-44`, `p-3`→`p-4`, 배경에 `bg-surface-raised`를 얹어 콘텐츠(surface-card)와 톤 분리 — 새 토큰 없이 기존 weave 시맨틱 토큰만 조합.
- **새 컴포넌트 `SettingsRow`**(`features/settings/components/`): 라벨+설명(좌)/컨트롤(우) 한 줄 정렬 + 행 사이 `border-b` 구분선(마지막 행은 선 없음) — Notion 등 업계 표준 설정 행 패턴. `htmlFor`가 있으면 `<label>`, 없으면 `<span>`으로 분기해 시맨틱을 지킨다(테마 토글처럼 짝지어지는 폼 컨트롤이 없는 행도 있어서). props-driven UI-only 컴포넌트라 `components/ui/`가 아니라 feature 내부에 둠(아직 이 feature 안에서만 쓰임, 2곳 이상에서 쓰이면 승격 검토).
- **섹션 헤더에 서브타이틀**: `GeneralSection`/`AccountSection`의 h2를 `text-base`→`text-lg`로 키우고(Notion Preferences의 "큰 타이틀" 인상), 그 아래 한 줄 서브타이틀을 추가했다(`settings.general_subtitle`/`settings.account_subtitle`, en 실작성 + ko는 이 PR 컨벤션대로 en과 동일 placeholder). `GeneralSection`의 Theme·앱 언어 필드, `AccountSection`의 계정 삭제 행을 `SettingsRow`로 재구성.
- **Danger zone 라벨**: `AccountSection`의 계정 삭제 행 위에 `account.danger_zone_label`("Danger zone") eyebrow 라벨을 얹었다. 톤은 `text-status-error/70`(uppercase, tracking-wide)로 절제 — 꽉 찬 빨강 배경 박스 대신 옅은 텍스트 톤만 쓰는 Notion 패턴을 따름, `/70` 같은 투명도 조합은 이미 `Button` danger variant·DevToolbar 등에서 쓰던 관례라 새 토큰이 아니다. 기존 `border-t pt-6` 구분(프로필 블록과 danger 영역 사이)은 유지.
- **`AccountDeleteFlow` 리듬 정렬**: 게이팅(로딩·에러·차단)·확인 화면 4개 상태 모두 `h-full flex-col` + 하단 `DialogFooter`(`border-t border-border pt-4`) 구조로 통일했다 — 이전엔 차단/에러 화면만 콘텐츠 바로 아래 `self-start` 버튼이었는데, 이제 모든 상태의 액션이 모달 하단에 구분선과 함께 고정되어 `GeneralSection`과 같은 리듬을 공유한다. h2도 `text-lg`로 맞춤. **문구·게이팅 로직·`trpc.account.*` 호출·확인 로직은 전혀 손대지 않았다** — 지침대로 정렬/spacing만.
- **Footer 구분선**: `GeneralSection`의 `DialogFooter`에도 `border-t border-border pt-4`를 추가해 콘텐츠와 액션 영역을 시각적으로 분리(Notion류 모달 컨벤션).
- 라이브 브라우저 검증은 이번 라운드는 생략 — PM이 5176 포트(HMR)로 직접 확인하기로 함. 정적 검증(typecheck/lint/format/knip/depcruise)은 전부 통과 확인, 색 토큰은 코드 레벨로 라이트/다크 둘 다 유효한 기존 시맨틱 토큰만 썼는지 재확인(`surface-raised`/`surface-card`/`border`/`fg-primary`/`fg-tertiary`/`status-error` — 전부 기존에 라이트·다크 값이 정의된 토큰).

---

### 2026-07-10 — 설정 모달 2차 폴리싱: Preferences 리네이밍 + Theme Select화 + Account nav 최상단

PM이 1차 폴리싱 결과를 보고 추가로 확정한 세 가지 반영. 이번에도 순수 UI 패스 — `trpc.account.*`/게이팅/삭제 로직 무변경.

- **"일반" → "Preferences" 리네이밍**: 코드 식별자까지 끝까지 맞췄다 — `GeneralSection.tsx` 삭제하고 `PreferencesSection.tsx` 신설, `SettingsSection` 타입 값 `"general"`→`"preferences"`(SettingsModal 기본 상태·리셋 로직 포함 전체 동기화). i18n `settings.nav_general`→`settings.nav_preferences`, `settings.general_subtitle`→`settings.preferences_subtitle`로 이름을 맞춰 리네이밍(번역 값 자체는 변경 없이 키만 이동). 아이콘은 `Wrench`→`SlidersHorizontal`(`@nema-io/weave/icons` = lucide-react 재노출)로 교체 — lucide가 제공하는 설정류 아이콘(`Settings`/`Settings2`/`Cog`/`Sliders*`) 중 Notion의 Preferences 아이콘처럼 가로 슬라이더 3개로 보이는 게 `SlidersHorizontal` 하나뿐이라 가장 근접한 선택으로 판단.
- **Theme 컨트롤 세그먼트 → Select**: `ThemeToggle`을 버튼 그룹에서 `PreferencesSection`의 언어 선택과 동일한 weave `Select` 패턴으로 재작성, `Sun`/`Moon`/`Monitor` 아이콘은 전부 뺐다(텍스트만, 기존 `theme_light`/`dark`/`system` 키 재사용) — Theme·언어 두 컨트롤의 시각적 무게가 같아져 한 행 리듬 안에서 더 통일감 있다.
- **"Appearance"/"Language" 그룹 헤더**: 재사용 가능한 `SettingsSectionHeader`(라벨 텍스트 + 하단 얇은 구분선)를 새로 뽑아 `PreferencesSection`의 Theme 행 위엔 "Appearance", 앱 언어 행 위엔 "Language" 헤더를 얹었다(`settings.appearance_section`/`language_section` 신규 키). `SettingsRow`(행 자체의 라벨+설명/컨트롤)와는 별도 레이어 — 그룹 헤더는 여러 행을 한 카테고리로 묶는 역할이라 책임이 다르다.
- **Account nav 항목을 최상단 + 아바타·이름으로**: `SettingsNav`에서 순서를 Account 먼저·Preferences 나중으로 바꾸고, Account 항목은 제네릭 아이콘+라벨 매핑에서 완전히 빼내 `useUser()`로 가져온 `avatarUrl`+`displayName`을 직접 렌더링하는 전용 분기로 처리했다(`Avatar` 컴포넌트를 `size-5`로 축소해 nav 텍스트 크기와 맞춤). 그 결과 `settings.nav_account` i18n 키가 어디서도 안 쓰이게 돼(정적 라벨을 완전히 대체) 삭제했다. **모달 기본 진입 섹션은 그대로 Preferences**(surface-inventory "일반부터 보인다" 규칙 유지) — nav 순서만 바뀌고 `useState` 초기값·리셋 로직은 그대로다.
- **Account 섹션 제목만 "Profile"로**: `AccountSection.tsx`의 h2 텍스트를 새 키 `account.profile_title`("Profile")로 바꿨다. **코드 식별자(섹션 값 `"account"`, 파일명 `AccountSection.tsx`)는 그대로 유지** — 이 섹션은 프로필 정보뿐 아니라 계정 삭제(Danger zone)까지 포함해 "profile"이라는 이름은 범위가 좁아 코드 이름으로는 부적절하다고 판단, 화면 텍스트만 바꿨다.
- i18n은 지침대로 en 실작성, ko는 en과 동일 placeholder(이 PR 전체에서 일관된 컨벤션).
- 이번에도 라이브 브라우저 검증은 생략(PM이 5176에서 직접 확인). 정적 검증 전부 통과, 새로 쓴 클래스(`bg-surface-raised`, `text-fg-tertiary`, `border-border` 등)는 전부 기존에 라이트·다크 값이 있는 토큰 재사용.

---

### 2026-07-10 — Preferences: Save/Cancel 제거, 선택 즉시 반영

PM 요청으로 `PreferencesSection`의 앱 언어 Select를 Theme 토글과 같은 즉시-반영 방식으로 맞췄다 — 이제 이 화면엔 "저장을 눌러야 반영되는" 필드가 하나도 없어 Save/Cancel 자체가 무의미해져 `DialogFooter`를 통째로 뺐다. 계정 삭제 확인 화면(`AccountDeleteFlow`)의 Cancel/확인 버튼은 별개 성격(되돌릴 수 없는 위험 액션 확인)이라 손대지 않았다.

- `onValueChange`에서 `setAppLang`과 `changeLocale(v)`를 같이 호출 — controlled `Select`라 로컬 state는 유지하되(값 표시용), 실제 반영은 값이 바뀌는 즉시 일어난다. `handleSave`/`onOpenChange` prop 자체를 컴포넌트에서 제거했고, `SettingsModal`이 `<PreferencesSection onOpenChange={onOpenChange} />`로 넘기던 것도 정리했다(안 쓰는 prop 안 남김, typecheck로 확인).
- Footer 제거 후 레이아웃은 `flex h-full flex-col` 바깥 + `flex-1` 콘텐츠 wrapper 구조 그대로라 남는 공간이 자연스럽게 하단 여백으로 흡수된다(콘텐츠는 위쪽 정렬 유지, 별도 처리 불필요).
- `settings.save`가 이 변경으로 앱 전체에서 미사용이 돼(재검색으로 재확인) i18n에서 삭제. `common.cancel`은 `DeleteSessionDialog`/`DraftTabContent`/단축키 맵이 계속 써서 남김.

---

### 2026-07-10 — Profile 리듬 통일 + 삭제 로딩 스켈레톤 범위 축소 + nav 포커스 스타일 조정

PM 요청 세 가지, 전부 스타일/구조 패스(게이팅·`trpc.account.*` 로직 무변경).

- **`AccountSection` 외곽 리듬을 `PreferencesSection`과 통일**: 프로필 블록·danger zone 블록을 각자 다른 `mt-6`/`mt-8`로 따로 떼지 않고, `PreferencesSection`과 같은 `mt-6 flex flex-1 flex-col gap-6` 컨테이너 하나로 묶어 그 안에 두 블록을 나열했다. danger zone 고유의 시각 요소(빨간 톤 uppercase 라벨, `border-t`)는 유지. 프로필 블록엔 `SettingsSectionHeader`를 얹지 않기로 판단했다 — h2 제목이 이미 "Profile"이라 그 아래 또 헤더를 얹으면 같은 말을 두 번 하는 셈이라서(Preferences는 "Theme"와 "언어"라는 서로 다른 카테고리를 구분해야 해서 헤더가 필요했던 것과 다른 상황).
- **계정 삭제 로딩 스켈레톤 범위 축소**: `AccountDeleteFlow`가 이전엔 `blockersQuery.isLoading` 동안 화면 전체를 스켈레톤 2개로 덮었는데, 이제 제목(`account.delete_confirm_title`)·위험 경고(`Alert` + `account.delete_confirm_description`)·하단 Cancel/삭제 버튼은 로딩 여부와 무관하게 항상 즉시 렌더링되고, 이메일 타이핑 확인 폼(`label`+`Input`) 자리만 그 모양 그대로(라벨 높이·Input 높이) 스켈레톤으로 대체했다. 데이터가 오면 `blockingCount > 0`이면 blocked 화면 전체로 스왑되고, 아니면 스켈레톤 자리에 실제 폼이 들어온다 — 게이팅 여부를 모르는 로딩 중엔 confirm 화면을 낙관적으로 먼저 보여주는 셈이라, 삭제 버튼은 그동안 `isLoadingBlockers`로 추가 disabled 처리했다(오조작 방지, "로딩 중이니 disabled"라는 PM 요청 그대로).
- **Nav 포커스 스타일 — 요청과 다르게 처리(플래그)**: PM은 `SettingsNav`의 `focus-visible:ring-2 focus-visible:ring-brand`를 완전히 제거해달라고 했지만, `apps/web/docs/conventions.md` Accessibility 절의 "MUST NOT remove focus styles"와 정면으로 충돌해 **그대로 삭제하지 않고 대체**했다 — 링 대신 `focus-visible:bg-surface-raised-hover`(이미 hover에 쓰는 톤 재사용, 새 토큰 아님)로 키보드 포커스 시 배경이 살짝 바뀌게 했다. PM이 싫어한 "링" 자체는 없어지고, 키보드 전용 사용자를 위한 포커스 신호는 남아있다. 링을 정말 완전히 없애고 싶다면(포커스 신호 자체를 포기) 확인 후 재작업 필요 — PM 판단 필요 지점으로 남김. **amendment(2026-07-10, 코드리뷰 라운드)**: 이 항목은 라이트/다크 실측 문장이 없어 지적받았다 — 당시엔 검증하지 않았다(정직하게 기록). 이후 라운드에서 `focus-visible:bg-surface-raised-hover`는 active 상태와 배경이 겹쳐 구분이 안 된다는 문제가 추가로 발견돼 `focus-visible:ring-1 focus-visible:ring-brand`(active 배경과 별개로 항상 보이는 신호)를 더하는 방향으로 다시 바뀌었다 — 아래 코드리뷰 반영 세션 기록 참고.

### 2026-07-10 — Space 관리: 생성·이름변경·삭제 FE (BE #379 space-router 위)

BE의 `space.create/rename/delete`(+`workspace.bootstrap`의 `spaces`) 위에 Space CRUD를 얹었다. 스택 브랜치(BE 커밋이 이미 얹혀 있는 `feat/space-management-fe`)에서 작업 — 목업이 아니라 실제 계약 사용.

- **엔트리 포인트는 세션(옛 사이드바) 관례를 그대로 이식**: 이 저장소에 이미 있는 `SessionItem`/`SessionItemMenu`/`DeleteSessionDialog`(`features/session/components/`) 패턴 — group-hover로 드러나는 "..." 아이콘 버튼 + `DropdownMenu`(이름 변경/삭제) — 을 Space 목록 항목에 그대로 이식했다(`SpaceListItem`/`SpaceItemMenu`). 새 상호작용 문법을 만들지 않고 이미 검증된 걸 재사용하는 편을 택함. 세션의 "이름 변경"은 그 자리 인라인 편집(`RenameInput`)이지만, `surface-inventory.md`의 "Space 설정 모달" 문서(생성·이름변경을 한 모달이 `mode`로 나눠 처리)가 이미 있어 그 구조를 따라 인라인이 아니라 모달(`SpaceModal`, mode=`create`|`rename`)로 갔다 — Space 모델 필드가 `name` 하나뿐이라 모달이 가볍고, 문서화된 기존 설계를 따르는 게 이 자리에서 새로 판단하는 것보다 낫다고 봤다.
- **`surface-inventory.md`의 옛 설계와 다르게 간 지점**: 그 문서는 "이름을 비우면 '새 Space'로 대체, 별도 인라인 검증 에러 없음"이라 적혀 있었지만, 이후 `workspace-account-flow.md`가 "Space 이름 미입력" 케이스를 별도로 확정(생성 안 됨 + 안내 필요)했으므로 기능 명세서 쪽을 따랐다 — 빈 이름 제출 시 `SpaceModal`이 인라인 에러(`space.name_required`, 로그인 화면의 `role="alert"` 관례 재사용)로 막고 자동 대체하지 않는다. `surface-inventory.md`는 이번엔 안 고쳤다(Space 관리 전용 문서가 아니라 서피스 전반 인벤토리라 범위 밖으로 판단) — 다음에 그 문서를 만지는 세션이 이 갭을 알아두면 됨.
- **이름 중복 에러는 새로 안 만듦**: BE가 이미 번역된 전체 메시지(`error.space_name_conflict`)를 CONFLICT로 내려주고(c4e0496에서 이 경로 자체를 고침), FE `mutationCache`가 전역으로 `toastError`를 띄우는 인프라(`lib/tanstack-query/index.ts`)가 이미 있어 그 위에 아무것도 얹지 않았다 — `SpaceModal`은 실패 시 그냥 닫히지 않고 그대로 열려 있어 유저가 토스트를 보고 이름을 고쳐 재시도할 수 있다. 세션 이름 변경(`useUpdateSession`)도 같은 전역 토스트에 기대는 걸 확인하고 따라감.
- **삭제 확인은 타이핑 확인으로 신설**: 세션 삭제(`DeleteSessionDialog`)는 버튼 한 번으로 확인하지만, Space 삭제는 콘텐츠(Digest·Source 등) 전체가 통째로 사라지는 더 무거운 삭제라 입력값이 Space 이름과 **정확히 일치**해야 삭제 버튼이 활성화되는 `SpaceDeleteDialog`를 새로 만들었다. 영향 개수("Digest N·Source M 사라짐")는 넣지 않았다 — `space.list`/`space.delete`/`workspace.bootstrap` 어디에도 per-space 콘텐츠 개수가 없다(계약 갭, PM 확인 후 이번 슬라이스는 일반 경고 문구로 진행하기로 함). **후속 필요**: per-space Digest/Source 개수를 주는 계약(별도 쿼리 또는 `space.list` 확장)이 생기면 `space.delete_warning`을 개수 포함 문구로 바꾸고 이 다이얼로그에 개수 prop을 추가한다.
- **마지막 Space 삭제 차단은 메뉴 비활성이 아니라 다이얼로그 분기로 표현**: "삭제 버튼 비활성/경고"를 Radix `DropdownMenuItem`의 `disabled`(=`pointer-events-none`)로 구현하면 hover 툴팁이 함께 죽어 안내를 못 보여준다. `LnbPlaceholderItem`처럼 `aria-disabled` + 수동 Tooltip 조합도 가능했지만, `Tooltip`을 `DropdownMenuContent` 안에 중첩하면 두 Radix 포털의 hover 상태가 꼬일 위험이 있어(둘 다 하나뿐인 이 규모의 기능에 걸기엔 과함) 대신 메뉴 항목은 항상 클릭 가능하게 두고 `SpaceDeleteDialog`가 `isLastSpace`일 때 확인 입력 없이 차단 안내만 보여주는 별도 분기(`SpaceDeleteBlockedForm`)로 렌더한다. 클릭 한 번 더 들어가지만 실패 모드가 없다.
- **삭제 후 이동은 "지금 보고 있던 Space일 때만" 홈(`/`)으로, 직전 세션 결정과의 충돌을 인지하고 진행**: 기능 명세서 초안은 "다른 Space의 오버뷰로 이동"이었지만, 어느 Space로 보낼지의 자의성을 피하기 위해 PM 확인 후 홈으로 확정했다. **무조건 홈으로 가는 게 아니라, 삭제한 Space가 삭제 시점에 라우트 파라미터로 열려 있던 그 Space일 때만** 이동한다(`shouldNavigateHomeAfterSpaceDelete`, `useParams`로 비교) — LNB에서 지금 보고 있지 않은 다른 Space를 지운 경우엔 화면이 그대로 유지된다(세션 삭제의 "지금 열려 있는 세션을 지웠을 때만 홈으로" 관례와 동일). 다만 바로 위 세션(신규 유저 랜딩)이 "홈이 아직 옛 세션 사이드바 셸이라 새 LNB에서 누르면 셸이 통째로 바뀌는 어색함이 있어 LNB에서 홈 항목을 뺐다"고 명시적으로 남긴 결정과 이 선택은 정면으로 충돌한다 — 지금 보던 Space를 지운 경우의 `navigate({ to: "/" })`는 `_workspaceSidebar`(새 LNB)에서 `_sessionSidebar`(옛 셸)로 레이아웃 전체가 전환되는 그 어색함을 그대로 겪는다. 이 트레이드오프를 인지한 채 PM이 "글자 그대로 홈으로"를 선택했다 — 홈 자체가 새 LNB 세계로 옮겨오는 후속 슬라이스가 이 어색함의 진짜 해소책이다.
- **이번에 추가한 `space.*` i18n 키의 ko 값도 en과 동일한 영어 placeholder** — 번역 누락이 아니라 직전 세션(신규 유저 랜딩)이 같은 `space` 네임스페이스에 이미 세운 관례(`tab_topic`/`topic_empty` 등도 en=ko)를 그대로 따른 것이다. ko 라이팅은 화면 단위 후속 UX 패스에서 한 번에 처리한다.
- **신규 컴포넌트**: `SpaceModal`(생성+이름변경, mode 분기) + `SpaceDeleteDialog`(+`SpaceDeleteBlockedForm`/`SpaceDeleteConfirmForm`) + `SpaceItemMenu` + `SpaceListItem`(LNB 항목, collapsed는 기존 `SidebarNavLink` 그대로, 펼침 상태만 hover 메뉴 붙인 자체 마크업) + `NewSpaceButton`(LNB "+ 새 Space" 트리거, 기존 `LnbPlaceholderItem` 자리를 대체) + 훅 3종(`useCreateSpace`/`useRenameSpace`/`useDeleteSpace`, 전부 성공 시 `workspace.bootstrap` invalidate — Space 목록·오버뷰 타이틀이 이 쿼리 하나에 물려 있어 별도 `space.list` 조회를 새로 붙이지 않음).
- **정적 검사**: 타입체크·린트·knip·depcruise 전부 그린. 로컬 Supabase(`supabase start` + `db reset`)로 BE #379의 `space_management_rpcs` 마이그레이션까지 적용.
- **브라우저 e2e**: 로컬 서버 부팅이 한 차례 Qdrant 컬렉션 접근(`statements-local`, 403 Forbidden — Space 기능과 무관한 벡터스토어 인프라/키 문제)에서 막혔으나, `apps/server`를 `turbo` 없이 직접 `tsx watch`로 띄우는 우회로 해결(`turbo run dev:local`이 `QDRANT_COLLECTION` 셸 오버라이드를 그대로 전달하지 않는 것으로 보임 — 원인은 별도 확인 필요). 이후 매직링크 로그인 → Space 관리 9개 케이스(생성/미입력/취소/중복·이름변경/중복·전환·삭제(활성/비활성 Space)·마지막 Space 차단) 전부 라이트/다크 모드에서 브라우저로 직접 확인함 — "삭제한 Space가 지금 보던 Space일 때만 홈 이동" 분기도 이 검증 중 발견해 고쳤다(비활성 Space를 지워도 화면이 안 튕기는지 실제로 확인).

---

### 2026-07-10 — 백로그: LNB 접힘 상태 Space 목록 아이콘 식별성

`SpaceList`(→ `SidebarNavLink` 접힘 분기)는 모든 Space를 동일한 `Hash` 아이콘으로 렌더한다. Space가 1개뿐인 지금은 문제없지만, 여러 Space를 만들게 되면 접힘 상태에서 전부 같은 아이콘으로 보여 hover 툴팁 없이는 구분이 안 된다.

- 웹서치로 확인한 업계 패턴: 고정되고 유한한 메뉴(Ask/References처럼 아이콘 하나에 늘 매핑)는 접힘 상태에서 문제없지만, **사용자가 계속 만들어내는 동적 목록**(Notion 페이지, VS Code 파일 트리 등)은 접힘 시 전부 같은 제네릭 아이콘으로 뭉개지는 문제가 실제로 있다(`shadcn/ui` 이슈 [#5874](https://github.com/shadcn-ui/ui/issues/5874)도 이 지점을 버그로 보고). 그래서 일부 제품은 이런 동적 목록이 있는 사이드바는 아예 접힘=완전히 숨김으로 가기도 한다.
- **지금 안 고치는 이유**: nema의 접힘은 "잠깐 화면 넓게 쓰기" 용도로 이미 유효하게 쓰이고 있어(워크스페이스 아바타·Ask/References 고정 아이콘은 접힘에서도 식별 가능), Notion/Linear처럼 선제적으로 완전히 숨기는 쪽으로 갈 필요는 없다고 판단. Space 개수가 적은 지금은 체감 문제도 작다.
- **재검토 시점**: 멀티 Space가 실제로 늘어나는 시점(계정 드롭다운 프로필/워크스페이스 분리 재검토와 같은 타이밍) — 접힘을 없애는 대신, Space 아이템에 워크스페이스 아바타처럼 이니셜/색상 같은 구분자를 넣는 방향을 먼저 검토할 것.

---

### 2026-07-11 — LNB 섹션 라벨·아이템 위계 조정 (이전 결정 번복)

`LnbSection` 라벨("Workspace"/"Spaces")의 대문자 표기를 파스칼 케이스로 되돌렸다. **이전 세션(2026-07-10, 신규 유저 랜딩) 기록엔 "CSS `uppercase`로 대문자화, i18n 값은 문장 케이스"라고 명시돼 있었는데, 실제 서비스들을 둘러본 결과 대문자 라벨을 쓰는 곳이 없다는 판단하에 뒤집었다** — i18n 값(`workspace.section_workspace`/`section_spaces`, en/ko 둘 다 "Workspace"/"Spaces")은 이미 파스칼 케이스라 그대로 쓰고, `LnbSection.tsx`에서 `uppercase`·`tracking-wide` 클래스만 제거(대문자 전용으로 넓힌 자간이라 같이 뺌).

이어서 워크스페이스 스위처(14px, 아바타 포함)만 도드라지고 그 아래(섹션 라벨 + `Ask`/`References`/Space 목록/새 Space 아이템)는 전부 차분해 보이도록 위계를 조정:

- **폰트**: `SidebarNavLink`·`LnbPlaceholderItem` 아이템 텍스트 `text-sm`(14px) → `text-xs`(12px), 라벨과 같은 크기로.
- **좌측 들여쓰기**: 라벨(`pl-4`=16px)과 아이템 아이콘·텍스트 시작 지점을 x=16으로 통일 — 아이템의 하이라이트 박스 자체는 x=6(워크스페이스 pill과 정렬된 값, 이전 라운드 결정)에 그대로 두고, `Link`/placeholder의 내부 패딩만 `px-1.5`→`px-2.5`로 늘려 박스 위치는 안 건드리고 텍스트만 안쪽으로 밀었다.
- **행 높이**: `h-9`(36px) → `h-8`(32px), 접힘 정사각 터치 영역도 `size-9`→`size-8`로 같이 축소. `SpaceList` 스켈레톤 치수도 동일하게 맞춰 로딩→실콘텐츠 전환 시 레이아웃 점프 없음.
- **재사용**: `SidebarNavLink`가 세션 사이드바와 공유되는 컴포넌트라 위 변경이 그쪽에도 그대로 적용됨(의도됨 — 폴더 사이드바 전체가 더 컴팩트해짐).

---

### 2026-07-12 — 폴리싱 세션 인수인계 (별도 폴리싱 전담 세션 신설 전 기록)

PR #382에서 LNB 워크스페이스 스위처·Space 목록·설정 모달을 여러 라운드에 걸쳐 시각 폴리싱한 세션의 마무리 기록. 앞으로 UI 폴리싱을 전담하는 별도 세션이 생길 예정이라, 그 세션이 처음부터 재도출하지 않도록 확정된 규칙과 미해결 항목을 남긴다.

**확정된 디자인 규칙 (재도출 불필요)**
- LNB 행 호버 배경: `surface-raised-hover/75`. 그 행 위에 겹치는 액션 아이콘(우측 "...", "+", 접기 토글)은 진한 토큰 그대로 두고 `hover:brightness-95`(라이트, 어둡게)+`dark:hover:brightness-125`(다크, 반대로 밝게)로 방향을 뒤집어야 구분이 유지된다 — 다크에서 어둡게 하면 오히려 배경과 가까워져 구분이 흐려짐(비직관적이라 재발견 비용 큼, 꼭 기억할 것).
- "행 위에 겹치는 절대 위치 아이콘"이 있는 곳은 아래 행의 배경 트리거를 `hover:`가 아니라 조상의 `group-hover:`로 걸어야 한다. `hover:`로 걸면 아이콘에 마우스가 있을 때 형제 관계라 :hover가 전파 안 돼 배경이 꺼지는 버그가 생긴다(이번 세션에 실제로 겪고 고침) — `NavItem`/`LnbRowBox`가 이 규칙을 이미 캡슐화하고 있으니 새로 짤 필요 없음.
- LNB 행 치수(`h-7`, 접힘 `size-7`, 좌우 마진 `px-2`, 상하 패딩 `py-px`)와 액션 아이콘(`size-5`, hover 톤)은 각 파일에 흩어져 있지 않고 공통 프리미티브로 통합됨 — 아래 "공통 프리미티브" 참고. 값을 또 조정할 땐 프리미티브 한 곳만 고치면 된다.
- Danger 계열(Button danger, DropdownMenuItem danger, Alert error)은 전부 `bg-status-error-tint text-status-error` 계열 톤으로 시각적으로 통일돼 있다. **다만 클래스 자체가 공유되는 건 `Button`의 `danger` variant(weave `.surface-danger` 컴포넌트 클래스로 정의)뿐** — `DropdownMenuItem`은 같은 색 조합을 `data-[variant=danger]:text-status-error`/`data-[variant=danger]:focus:bg-status-error-tint` 등으로 별도 선언하고 있어(속성 셀렉터 기반이라 `.surface-danger`를 그대로 재사용할 수 없는 구조), `.surface-danger`만 고치면 `DropdownMenuItem` 쪽은 조용히 어긋난다. 톤을 바꿀 땐 두 군데 모두 확인할 것 — 개별 컴포넌트에 이 조합과 다른 로컬 override는 만들지 말 것.
- 포커스링은 `focus-visible:`만 사용(`focus:` 금지), outline 기반 전역 정책이 `packages/weave/src/tokens/index.css`에 이미 구현돼 있어 개별 컴포넌트가 각자 링을 그릴 필요 없음.

**공통 프리미티브 (LNB 폴리싱 중 신설, `apps/web/src/components/layout/`)**
- `NavItem` — 탐색 가능한 LNB 행(접힘/펼침, 툴팁, active, 비활성 placeholder, 우측 오버레이 아이콘 슬롯). `SidebarNavLink`/`LnbPlaceholderItem`/`SpaceListItem`의 반복 마크업을 대체했다. 세션 사이드바(`SessionSidebar`)와 워크스페이스 사이드바(`WorkspaceSidebar`) 둘 다 이걸 쓴다.
- `LnbRowBox` — NavItem 펼침 행과 `LnbSection` 라벨 행이 공유하는 박스 모양(`h-7 rounded-lg px-2.5` 등). `asChild`(weave가 재노출하는 Radix `Slot`)로 Link/div/span 등 어떤 걸 감싸든 같은 박스가 나온다.
- `LnbHoverIcon` — 행 위에 겹치는 우측 액션 아이콘(`SpaceItemMenu` "...", `LnbSection` "+", `WorkspaceMenu` 토글)의 공통 hover 스타일. NavItem을 거치지 않는 곳(LnbSection, WorkspaceMenu)에서도 직접 쓴다 — NavItem 전용이 아니다.
- **LNB 바깥(설정 모달 `SettingsNav` 등)은 고려 범위 밖**이다 — Link가 아니라 button, 접힘 상태 없음, 크기 체계도 달라 구조가 다르다. 재사용 압력(2번째 인스턴스)이 생기기 전까진 강제 통합하지 않는다.
- `LnbSection` — 라벨 행 + 접기 대응 섹션 래퍼(`NavItem`/`LnbRowBox`/`LnbHoverIcon`과 같은 층위의 공용 LNB 프리미티브). 최초 도입 시 `features/workspace/components/`에 남아 있었는데(워크스페이스 도메인 로직 없이 `label`/`children`/`trailingAction`만 받는 순수 레이아웃 컴포넌트), 위 세 프리미티브와 나란히 `components/layout/`로 이동(2026-07-12). 사용처는 지금 `WorkspaceSidebar` 하나뿐이지만 위치는 도메인이 아니라 레이어로 정함.

**앞으로 폴리싱할 때 적용할 기준**
- 값 하나(색, 크기, 여백)를 3곳 이상 동시에 고쳐야 한다면 그 자리에서 개별 수정하지 말고 위 프리미티브에 없는 값인지부터 확인 — 프리미티브 커버 범위 밖이면 새로 뽑을지 이 시점에 판단.
- 색·톤 변경은 항상 라이트/다크 둘 다 확인 — 이번 세션 버그 다수가 다크 모드에서만 터졌다(예: Select 호버가 컨테이너 배경과 같은 색이라 안 보이던 것, brightness 방향이 반대였던 것).
- 절대 위치로 겹치는 요소를 새로 만들 때는 형제 occlusion으로 아래 요소의 `:hover`가 죽는지 항상 의심할 것(위 규칙 참고).
- weave(디자인 시스템) 레벨 변경은 항상 다른 소비처를 먼저 grep — 로컬처럼 보여도 전역 영향일 수 있다(danger variant가 실제로 5개 버튼에 영향을 준 사례).
- red/danger 톤은 이 프로젝트에서 유독 왔다 갔다 한 이력이 있다(톤다운 후 전량 원복된 전례) — 로컬 override로 할지 weave 전역으로 할지 범위를 먼저 확인하고 진행.
- 매 변경 후 `pnpm --filter web typecheck`/`lint`(+ 구조 변경 시 `knip`) 확인, weave 레벨 변경 후엔 dev 서버 재기동.

**의도된 제품 결정: 접힘 상태에서 Space 추가·이름변경·삭제 불가**
접힘 LNB에서는 Spaces 섹션의 "+" 버튼(`LnbSection`의 `trailingAction`)과 각 Space 행의 "..." 메뉴(`SpaceItemMenu`, `NavItem`의 `trailingAction`)가 렌더링되지 않는다 — 둘 다 NavItem/LnbSection의 `trailingAction`이 펼침 모드에서만 렌더되는 설계라서다. 회귀가 아니라 확정된 트레이드오프: 접힘은 "잠깐 화면 넓게 쓰기" 용도이고, 이 액션들은 자주 쓰는 동작이 아니라 접힘 상태에서 대체 진입점 없이 빼기로 했다. 필요하면 펼침으로 전환 후 사용.

**PR 상태**: #382 open. 최신 커밋은 `git log`로 확인 — 이 라인에 특정 해시를 박아두면 다음 커밋마다 stale해지므로 의도적으로 안 적는다. 제목/본문은 PM 요청으로 갱신 안 함 — 폴리싱 세션이 이 PR을 이어 쓸지 새 PR로 시작할지 PM 확인 필요.

---

### 2026-07-12 — 인테이크 1차 슬라이스: Space 오버뷰 인라인 컴포저 + 초안 화면

`intake-flow.md`의 "Source 제출"·"초안 관리" 중 1차 케이스(제출·빈 입력 비활성화·처리중/실패/결과없음 상태 표시·LNB 조건부 노출)만. 취소·재시도·삭제·Space재지정·제목편집·액션잠금은 2차. dev-harness의 검증된 tRPC 계약(`source.create`/`source.listPending`)을 재사용하되 UI·훅은 제품용으로 새로 작성.

- **착수 브리핑의 "Source 작성 모달"은 오독이었다 — surface-inventory.md를 다시 보고 정정**: 브리핑이 참조를 준 그 문서 자체에 "넣기 진입점은 모달이 아니라 인라인 자동 확장 textarea다(원래는 별도 화면 'Source 작성 모달'이었으나 폐기)"라고 명시돼 있었다. 처음엔 이걸 놓치고 초안 화면에 "+ New source" 모달(`SourceComposerModal`/`SourceComposerForm`)을 만들었다가, PM 리뷰에서 지적받고 폐기 — 대신 Space 오버뷰에 인라인 컴포저를 얹는 원래 설계로 되돌아갔다. **초안 화면은 관리·열람 전용으로 확정**(생성 진입점 없음, PM 확인) — surface-inventory의 초안 카드 구성(Space 셀렉트·제목편집 등 액션)도 애초에 생성 진입점을 안 갖고 있어 이 결정과 합치한다.
- **`SourceComposer`**: `components/ui/ChatInput`(자동 확장 textarea+제출 버튼, Enter 제출/Shift+Enter 줄바꿈)을 그대로 재사용 — design-decisions-log 베이스라인이 이미 "정확히 일치, 모드 색상·placeholder만 스와핑하면 재사용 가능"이라 판단해둔 것을 그대로 따름. 모드 색상(remember/ask)은 이 컴포저엔 없는 개념이라 안 씀. `SpaceOverview`의 타이틀과 탭 사이(마크업 순서도 그 순서, 와이어프레임 근거)에 배치.
- **`spaceId` 배관 — 백엔드 갭 발견하고 같이 고침(PM 확인 후 진행)**: `createSource` 서비스가 spaceId를 인자로 안 받고 "가장 오래된 Space" 멤버십을 자동으로 찾아 쓰고 있었다(1인 단계 가정 코드). 컴포저를 Space 오버뷰(Space별 라우트)에 인라인으로 얹으면 여러 Space를 가진 유저가 지금 보고 있지 않은 Space에서 글을 써도 항상 가장 오래된 Space로 들어가는 조용한 오류가 생긴다 — Space 관리(#381)로 멀티 Space가 이미 열려 있어 실제로 도달 가능한 버그. `SourceCreateInputSchema`에 `spaceId` 선택 필드를 추가하고, `createSource`가 있으면 그대로 쓰고 없으면 기존 멤버십 조회로 폴백하게 했다(MCP·dev-harness는 spaceId를 안 보내므로 동작 불변). RPC(`create_source`)는 이미 `is_space_member(p_space_id)` 검증을 갖고 있어 임의 spaceId를 넘겨도 소유권 검증은 안전하게 RPC가 막는다 — 별도 마이그레이션 불필요.
- **초안 목록 — `body` 필드 추가(백엔드 확장)**: `listPendingSources`가 `id/created_at/digestion_status/error_message`만 select하고 있어서, title 컬럼이 없는 이번 슬라이스 요구("내용 미리보기로 식별")를 채울 데이터가 없었다. select에 `body` 한 컬럼만 추가 — 새 로직·마이그레이션 없는 순수 additive 확장이라 FE-only 슬라이스 취지와 안 어긋난다고 판단.
- **초안 판정 — `reviewChangesetId`가 있으면 "초안 아님"**: `isDraftItem`(reviewChangesetId===null)로 필터링. digestion이 끝나 ingestion changeset이 열리면(=리뷰 준비됨) 그 Source는 개념적으로 "변경셋" 탭 소관이라 이 화면에서 사라지는 게 맞다(surface-inventory "Changeset 없이 pending으로 남은 Source"라는 정의 그대로). 변경셋 탭 자체는 아직 빈 스텁이라 그쪽으로 넘어간 뒤엔 화면상 확인할 방법이 없음 — 다음 슬라이스(Digest 리뷰 화면) 몫으로 인지하고 넘어감.
- **상태 3종 + 에러 메시지 비노출**: `digestionStatus`(pending/completed/failed) + reviewChangesetId 조합으로 `processing`/`failed`/`empty` 파생(`draftStatus`). `error_message`는 워커가 원본 예외 메시지(`err.message`)를 그대로 저장하는 내부 디버그 텍스트라(`statement-sync/digestion.ts` 확인) 사용자에게 그대로 노출하지 않고 고정 안내 문구로 대체 — ux-writing.md "에러: 공감, 해결 안내, 사용자를 탓하지 않음" 원칙.
- **LNB 항목**: `DraftsNavItem`, 묻기·해설 바로 아래·Workspace 섹션 위(와이어프레임 주석 "긴급도 기준" 그대로). 아이콘은 처음 `Inbox`로 갔다가 PM이 "Linear Drafts 아이콘은 문서 형태"라고 지적해 `FileText`로 교체 — Linear 관례를 따르기로 한 게 이미 이 초안 개념 자체의 근거(surface-inventory "Linear의 Drafts처럼")라 아이콘도 그 참조에 맞췄다.
- **신규 컴포넌트**: `SourceComposer`(도메인 래퍼) + `DraftsScreen`/`DraftList`/`DraftCard`(관리 전용, 카드에 액션 없음) + `DraftsNavItem`. 훅은 dev-harness 계약을 그대로 미러(`useCreateSource`/`usePendingSourceListQuery`)하되 새로 작성 — dev-harness는 `index.ts`에 `HarnessPage`만 공개해 boundaries 규칙상 훅을 직접 import할 방법이 없었다.
- **`RelativeTime` 컴포넌트를 `features/session`에서 `components/ui`로 승격**: DraftCard의 타임스탬프 표시에 필요했는데, 기존 `RelativeTime`(date-fns `formatDistanceToNow`, tolgee 언어 연동, 1분 tick)이 도메인 결합 없는 순수 UI라 승격 조건(2개 feature 이상 소비)을 충족 — `AssistantMessage`(session)와 `DraftCard`(intake) 두 곳이 씀. 새로 안 만들고 이동 후 import 경로만 바꿈.
- **i18n**: `intake.*`(신규 네임스페이스) + `workspace.drafts`(카운트 인터폴레이션 `{count}`) en 실작성, ko는 이 PR 컨벤션대로 en과 동일 placeholder.
- **검증 — 라이브 E2E 중 인프라 이슈 발견, 별도 정정**: 로컬 `dev:local` 부트스트랩이 Qdrant `statements-local` 컬렉션에서 403으로 막힘. 진단 결과 turbo와 무관하고(직접 `tsx` 실행도 동일 403), 공용 `.env.secret`의 Qdrant 키가 staging 전용이라 로컬 컬렉션엔 권한이 없는 것으로 확인됨 — **2026-07-10 세션 기록("turbo가 QDRANT_COLLECTION 오버라이드를 안 넘기는 것으로 보임")은 오진이었다**, 정정 남김. 이 인테이크 흐름(Digest 생성까지)은 임베딩·Qdrant를 실제로 안 건드리므로(그 단계는 사람이 리뷰 확정해야 도달, 화면 자체가 아직 없음) `QDRANT_COLLECTION=statements-staging`으로 존재-체크만 통과시켜도 실제 벡터 쓰기는 없어 안전 — 로컬 서버(포트 충돌 회피용 별도 PORT) 부팅에 이 우회를 씀.
- **최종 검증은 staging API(`pnpm dev:web`) + Kyle 실계정으로 진행**(로컬 인프라 문제로 로컬 E2E 대신). 상태 전이 자체는 임시 provider stub(`providers.ts`의 `generateDigests` task만 매직 키워드로 분기, PR 전 완전히 되돌림 — 커밋 안 됨)으로 처리중/성공/실패를 반복 확인한 뒤, 실제 LLM 콜로도 1회 확인.

**amendment(2026-07-12, PR 리뷰 반영)**: 멀티 에이전트 리뷰에서 나온 지적 중 실사용 영향 있는 것만 반영.
- `draftStatus`가 "호출 전에 `isDraftItem`으로 걸러졌다"는 순서를 암묵적으로 전제하던 걸 없앴다 — `reviewChangesetId`가 있으면 `null`을 반환하도록 판정 자체를 함수 안으로 옮기고, `isDraftItem`은 그 결과의 파생으로 재정의했다. `DraftList`는 이제 `draftStatus`가 `null`이 아닌 항목만 남기는 `map`+타입가드 한 번으로 필터링과 상태 계산을 같이 한다 — 두 번째 소비처가 생기기 전에 구조로 막은 것.
- `usePendingSourceListQuery` 조회 실패가 "초안 없음"과 똑같이 보이던 문제 — `refetchInterval`이 `data===undefined`일 때 `false`를 반환해 에러 상태에서 자동 복구도 안 됐다. `DraftList`에 `isError` 분기를 따로 추가(빈 상태와 다른 문구), `DraftsNavItem`은 에러일 땐 0개로 오인해 항목을 숨기지 않게 했다.
- `useCreateSource`의 `spaceId`를 타입 레벨에서 필수로 좁혔다(스키마는 MCP·dev-harness 호환 때문에 optional 유지) — 지금 유일한 소비처(`SourceComposer`)는 이미 항상 넘기고 있어 동작 변화는 없지만, 새 진입점이 spaceId를 빠뜨리면 이번에 고친 버그가 그대로 재발할 수 있는 구조라 타입으로 막았다. `mutate`/`mutateAsync` 함수 타입만 좁히는 대입이라 캐스트 없이 컴파일된다(optional을 받는 함수는 required만 주는 호출자에게도 안전하다는 함수 매개변수 반공변성).
- `createSource`의 spaceId 우선순위(주어지면 그대로 씀, 없으면 가장 오래된 membership)에 회귀 테스트 추가 — 이 PR의 핵심 버그 수정인데 테스트가 없었다.
- `DraftCard`의 `failed` 배지가 `errorMessage`를 안 쓰고 고정 문구를 쓴다는 결정에 코드 쪽 WHY 주석이 없어서 추가 — 이 문서에만 있던 근거라 코드만 보는 사람은 "나중에 친절하게 연결해주면 되겠네"로 오해할 수 있었다.
- **문서 갭 기록만**: surface-inventory.md의 초안 절은 "상태는 딱 하나만 구분한다(처리 중이냐 아니냐)"로 서술돼 있는데, intake-flow.md의 케이스 목록은 실패·결과없음을 서로 다른 안내 문구를 가진 별개 케이스로 요구한다 — 이번 구현은 후자(더 상세하고 최신인 기능 명세)를 따라 3분류로 갔다. surface-inventory.md 쪽 문장이 그 이후 갱신 안 된 것으로 보임, 다음에 그 문서를 만지는 세션이 참고할 것.
- **반영 안 함(기각)**: "초안 목록을 Space로 스코프해야 하는 것 아니냐"는 지적은 기각 — surface-inventory가 초안 화면을 명시적으로 Workspace 전역으로 설계했다("잘못된 Space에 들어간 걸 여기서 한눈에 보고 바로잡을 수 있어야"). RPC 에러 코드 매핑(P0001 그대로 노출)은 실제 UI 경로로 도달 불가능해서(컴포저의 spaceId는 항상 현재 라우트의 Space이고, 아닌 Space면 SpaceOverview가 애초에 not-found로 막음) 보류.

---

### 2026-07-12 — 폴리싱 세션(전담) 1라운드: LNB 레이블·아이콘·워크스페이스 아이덴티티

#382 머지 후 새 워크트리에서 전담 폴리싱 세션이 시작한 첫 라운드. `docs/blueprints/first-product/design-reference-log.md`(레퍼런스 기준) 확립 이후 실제 화면(LNB)에 처음 적용한 결과. Kyle과 한 번에 하나씩 핑퐁하며 진행 — 결정 다수가 몇 차례 번복을 거쳐 정착됐다.

**제품 용어 재검토 (개념/코드 용어는 유지, 제품 용어만)**
- **Ask & Narrate → "Ask"(en) / "묻기"(ko)**: "Narrate"가 실제 시장에서 오디오 내레이션(NotebookLM Audio Overviews)·접근성 스크린리더(Windows Narrator)와 강하게 충돌한다는 걸 웹서치로 확인. 개념 용어 "Narration"·코드(`narrateText` 등)는 그대로 두고 제품 용어만 분리(glossary에 이미 있는 Statement/"Sentence" 분리 선례를 따름). "Ask" 단독으로 갈지 "Ask & Brief"로 갈지 오래 논의했으나, 최종적으로 nav 라벨은 "X & Y" 동사 조합보다 단일 명사가 표준(NN/g 가이드, Perplexity 실제 사례 확인)이라는 근거로 단독 "Ask"로 확정. 국문 "묻기"도 같은 이유로 단독.
- **References → "Wiki"(en) / "위키"(ko)**: "References"가 학술 인용/참고문헌과 강하게 충돌(확인됨). 대체 후보로 "Index"를 먼저 제안했으나 실제 선례가 약해, Notion의 실제 "Wiki" 기능(검증 상태 포함 구조화 지식베이스)이 Nema의 Reference(인물·조직·프로젝트·제품·용어를 다듬어가며 유지)와 구조적으로 더 잘 맞아 최종 채택. 아이콘은 `BookMarked`(책갈피, 인용 연상 강화) → `Contact`(사람 아이콘, 이질적 엔티티 대표 못함, 기각) → `BookOpenText`(펼친 책, 위키/백과사전 인상)로 정착.
- 아이콘 선정은 실제 설치된 `lucide-react` 버전(`node_modules`)에서 export 이름을 직접 확인하고 골랐다 — 기억으로 추측하지 않음.

**타이포·간격**
- `LnbRowBox`에 `font-medium`을 기본값으로 넣어 Ask/Wiki/Space 이름 전부 기본 bold. `NavItem`의 `activeProps`에 있던 중복 `font-medium`은 제거(활성 상태는 배경 하이라이트만으로 구분).
- `NavItem` 텍스트를 `text-sm`(라벨 `text-xs`보다 한 단계 큼)으로 — 2026-07-11 라운드가 "레이블과 통일"로 내렸던 걸 다시 뒤집은 것. 이유: 레이블(카테고리 제목)과 아이템(실제 클릭 콘텐츠)은 역할이 달라 크기로도 구분돼야 한다는 판단(Notion/Linear류 사이드바 공통 패턴).
- `NavItem` 행에 `pl-3`(레이블 대비 2px)로 아주 살짝 들여쓰기 — 하이라이트 박스 위치는 안 건드리고 아이콘·텍스트만 안쪽으로 밀었다(2026-07-11 라운드와 같은 기법 재사용).
- `LnbSection`(레이블 행)에 `py-px` 추가 — `NavItem` 행엔 있었는데 레이블 행엔 없어서 레이블↔첫 아이템 간격(1px)과 아이템↔아이템 간격(2px)이 실측상 달랐던 것을 통일(둘 다 2px).

**긴 이름 처리**
- `NavItem` 펼침 상태의 활성(Link) 행에 `title={label}` 추가 — 잘린 이름은 네이티브 브라우저 툴팁으로 확인 가능(Carbon/PatternFly 등 실제 가이드가 권장하는 표준 패턴, 커스텀 `Tooltip`보다 단순해 이 케이스엔 이걸 채택). 처음엔 Radix `Tooltip`으로 감쌌다가, `LnbRowBox`가 `{ asChild, className, children }`만 받고 나머지 props(이벤트 핸들러)를 전달 안 해서 실제로 안 뜨는 버그를 발견 → `title` 속성으로 우회(이 저장소엔 "잘린 텍스트+툴팁" 선례 자체가 없었음, `SessionItem`/`UserMenu`/`WorkspaceMenu`도 다 `truncate`만 쓰고 툴팁 없음 확인).
- 아이콘에 `shrink-0` 누락돼 있어 긴 텍스트가 아이콘을 찌그러뜨리던 버그 발견·수정(`WorkspaceSidebar`의 `NAV_ICON_CLASS`, `SpaceListItem`의 아이콘 클래스).
- 텍스트 자체의 말줄임(`truncate`)이 `LnbRowBox`(flex 컨테이너) 레벨에 걸려 있어 실제로 동작 안 하던 버그 — `min-w-0 truncate`를 텍스트 전용 `<span>`으로 분리해 해결(flex item은 기본 `min-width: auto`라 내용 크기 이하로 안 줄어듦).
- 트레일링 액션(`SpaceItemMenu` "...") 자리로 쓰던 고정 `pr-8`을 `group-hover:pr-8`로 변경 — 평소엔 레이블이 끝까지 채우고, 호버 시에만 그만큼 패딩이 생겨 텍스트가 실시간으로 다시 말줄임된다(CSS만으로 동작, JS 불필요).

**Space 아이콘 — 색상 실험 후 중립으로 회귀**
`Hash` 아이콘(Slack/Discord식 "채널" 연상, Nema의 Space 개념과 안 맞음)을 대체하려고 이름 첫 글자 + Space id 해시 기반 색상 배지를 시도했으나(팔레트까지 설계·weave에 추가), Kyle이 실제로 보고 "여러 색이 리스트에 있으니 시끄럽다"고 판단해 철회. **이 판단은 사실 이미 내려져 있었다** — 2026-07-10 기록의 "백로그: LNB 접힘 상태 Space 목록 아이콘 식별성" 항목이 "지금 안 고침, 멀티 Space 실제로 늘어날 때 재검토"라고 이미 정리해뒀던 걸 이번에 배경 확인 없이 다시 열었던 것. 최종 정착: `Avatar`/색상 팔레트 다 걷어내고 `bg-fg-primary/10 text-fg-primary`(워크스페이스 배지가 다크모드에서 쓰던 것과 같은 조합, 테마별로 자동 조정)로 단순화. **위 백로그 판단은 여전히 유효 — 다음에 이 영역 만지는 세션은 재도출하지 말 것.**

**워크스페이스 배지 — 개인화 색상 도입 (Space와는 다른 결론)**
Space와 달리 이 배지는 **한 번에 하나만 보이는 단독 요소**라 색상 다양성이 시각적 소음이 되지 않는다고 판단(Slack/Notion의 워크스페이스 스위처가 실제로 브랜드색 대신 워크스페이스별 색을 쓰는 선례 확인). workspaceId 해시 기반으로 5색(violet-700/fuchsia-800/cyan-700/lime-700/yellow-700, 전부 흰 텍스트, WCAG AA 확인) 중 하나를 고정 배정. 몇 차례 조정 있었음:
- 처음엔 진한 3색(흰 텍스트)+밝은 3색(어두운 텍스트) 조합이었는데 Kyle이 "Rose가 너무 쨍하다" → rose 제외, 나머지 5색을 한 단계씩 더 어둡게, **가운데 텍스트는 전부 흰색으로 통일**(요청) → cyan/lime/yellow도 흰 텍스트가 통과하는 톤(-700)까지 다시 내림.
- 중간에 "옅은 틴트 배경+진한 텍스트"(status-tint와 같은 패턴)도 시도했다가 "이게 아닌 것 같다"는 피드백으로 원래의 꽉 찬 채우기 방식으로 복귀 — 틴트 버전 코드는 완전히 되돌림.
- `packages/weave`엔 `--palette-identity-*`(5색, 테마 무관 고정값 — 흰 텍스트 대비를 유지하려면 다크모드에서 밝아지는 일반 패턴을 못 씀)만 추가, workspaceId→색 매핑 로직(`apps/web/src/features/workspace/workspaceAvatarColor.ts`)은 앱 레벨.
- 접힘 배지 크기 `size-8`→`size-7`(다른 접힘 LNB 아이템과 통일, 이전엔 유독 4px 컸음). 로딩 스켈레톤 크기도 같이 맞춤.

**포커스링이 다음 행 배경에 가려지는 버그**
`NavItem`(펼침·접힘 모두)에 `relative` + `focus-visible:z-10` 추가 — outline이 `outline-offset-2`로 박스 밖까지 번지는데, LNB 행 간격이 좁아(2px) 다음 행에 가려지고 있었다. `SettingsNav`가 이미 같은 문제를 같은 방식으로 고쳐뒀던 선례를 그대로 따름. 워크스페이스 스위처 버튼 자체는 확인 결과 인접 요소가 없어 이 문제 대상 아님(Kyle 확인).

**접힘 사이드바 토글 버튼**: weave `Button`의 `icon-sm`(size-8)을 그대로 쓰고 있어 다른 접힘 아이템보다 컸음 — `Sidebar.tsx`에서 접힘일 때만 `size-7`로 로컬 override(펼침은 기존 유지). `Sidebar`가 `SessionSidebar`와 공유되는 컴포넌트라 그쪽 접힘 토글도 같이 맞춰짐(의도됨, 그쪽 `NavItem`도 이미 size-7).

**접힘 Space 스켈레톤**: `SpaceList`가 접힘 여부를 아예 안 보고 펼침용 스켈레톤(아이콘+긴 텍스트 바)을 그대로 썼던 버그 — 접힘 전용 분기(가운데 정렬 `size-7 rounded-lg`) 추가.

**다음 라운드**: Space 메인 콘텐츠(오버뷰 피드)로 이동 예정.

---

### 2026-07-12 — Space 오버뷰 마무리 + 설정 모달 Content language 재도입 (2026-07-10 결정 번복)

**v1 홈 완전 퇴장(2026-07-10 "LNB에 홈 항목은 뺐다" 결정의 후속 조치)**: 그 결정은 "홈이 아직 옛 세션 사이드바 셸이라 새 LNB에서 누르면 셸 전체가 어색하게 전환된다"는 이유로 LNB에서 홈 항목 자체를 뺐고, "홈은 v2 홈 화면을 새 LNB 아래로 옮기는 슬라이스에서 함께 붙인다"고 명시해뒀다. 이번 라운드가 정확히 그 슬라이스다 — v2 stub이라도 `WorkspaceSidebar`(새 LNB) 아래로 홈을 옮겨왔으니 LNB에 Home NavItem을 다시 추가했다. `/`가 v1 `HomePage`(세션 사이드바 셸) 대신 v2 `WorkspaceSidebar` 셸 아래 stub `WorkspaceHome`로 직접 연결되도록 라우트를 바꿨다. 처음엔 `/home`으로 별도 경로를 만들고 `/`는 리다이렉트만 하게 했었는데, Kyle이 "v1으로 이제 안 가도 되는데 굳이 리다이렉트를 거칠 이유가 있나"라고 지적 — 맞는 말이라 `/`를 v2 홈의 실제 경로로 바꾸고 리다이렉트 계층을 걷어냈다. v1 `HomePage`가 죽으면서 그 전용 의존이었던 `Greeting`·`useStartSession`·`useCreateSession`과, 그것들만 쓰던 캐시 프라임 함수 4개(`presetMessageCache`/`clearMessageCache`/`prependSessionCache`/`presetSessionCache`)도 연쇄로 죽어 함께 삭제(knip이 파일 단위는 잡았지만 정확히는 이 export 단위는 못 잡아서 수동 확인 후 정리 — JSON i18n 키의 죽은 참조도 knip은 못 잡는다는 걸 재확인, `session.empty_heading_*`/`empty_subheading_*` 10개도 같은 이유로 같이 정리).

**Space 없음 에러뷰**: 처음엔 앱 전역 `NotFoundErrorFallback`(워터마크+단일 문구) 재사용을 시도했다가, Kyle이 다른 레퍼런스(Linear "Team not found", X "This account doesn't exist")를 검토한 뒤 "전역 404는 원복하고, Space 쪽만 title+description으로 가자"고 정리 — 전역 404는 워터마크 있는 원래 형태 그대로 유지, `SpaceOverview.tsx`의 Space-없음 분기만 워터마크 없이 제목+설명 2줄 구조로 바꿨다(`space.not_found_title`/`not_found_description` 신규, 기존 `space.not_found` 대체). 제목엔 마침표 안 붙임(레이블성 타이틀은 마침표 없음 — Kyle 지적).

**Space 오버뷰 타이틀에 아이콘 추가**: LNB `SpaceListItem`과 같은 중립 배지(`bg-fg-primary/10 text-fg-primary rounded-md`, 첫 글자)를 타이틀 폰트 크기(`text-xl`)에 맞춰 `size-8`로 키워 재사용. 로딩 스켈레톤도 아이콘 자리를 같이 넣어 짝을 맞췄다. 이 김에 타이틀에 `truncate`가 빠져있던 것(긴 Space 이름이 줄바꿈되던 버그)도 같이 고쳤고, `WorkspaceHome.tsx`가 `t("common.home")` 대신 "Home"을 하드코딩해 한국어 로케일에서도 영어로 뜨던 버그도 발견해 고쳤다.

**LNB Space 목록 스켈레톤 들여쓰기 누락**: 실제 `NavItem` 행엔 `pl-3`(2026-07-11 라운드에서 결정한 라벨 대비 살짝 들여쓰기)이 있는데, `SpaceList.tsx`의 펼침 스켈레톤은 그 클래스 없이 기본 `LnbRowBox`만 써서 로딩 중엔 아이콘·텍스트가 실제 행보다 2px 왼쪽에 있었다 — `pl-3` 추가로 정합.

**접힘 LNB 아이콘 간격 통일**: Kyle이 "접힘 상태 아이콘이 다닥다닥 붙어있다"고 지적 — `NavItem`(접힘)·`SpaceList`(접힘 스켈레톤) 둘 다 `py-px`(아이콘 사이 총 2px)였는데, 펼침 행은 텍스트가 있어 같은 2px도 덜 빽빽해 보이지만 접힘은 순수 정사각형 아이콘만 쌓여 훨씬 눈에 띄었다. 워크스페이스 스위처(`WorkspaceMenuSlotCollapsed`)는 이미 `py-1`(8px 간격)을 쓰고 있어 스위처-첫 아이콘, 아이콘-아이콘 간격이 서로 다른 상태였던 것도 같이 발견 — 둘 다 `py-1`로 올려 전체 접힘 아이콘 리스트를 8px 간격으로 통일. 펼침 상태 리듬(`py-px`)은 2026-07-11 라운드에서 이미 다듬어둔 것이라 손대지 않음.

**설정 모달 Content language 재도입 — 2026-07-10 결정 번복**: Kyle이 "붙여넣는 원문 언어와 무관하게, 저장된 요약은 본인이 고른 언어로 구조화하고 싶을 것"이라며 재도입을 요청. **주의**: 2026-07-10 항목("계정 설정 리뷰 반영")에서 이미 한 번 "일반 섹션에 넣기 애매하다"는 이유로 `ContentLanguageSection` 자체를 완전히 삭제한 이력이 있다 — 이번 재도입 전 그 사실을 놓치고 "이미 glossary/코드에 있으니 그냥 넣으면 된다"고 판단할 뻔했으나, Kyle이 지적해 바로잡았다. `surface-inventory.md`의 "설정 (모달)" § "일반" 항목도 Theme+앱 언어만 언급하던 걸 콘텐츠 언어 포함으로 같이 갱신했다 — **문서와 실제 반영 상태가 다시 어긋나지 않도록, 이 결정 번복은 스펙 문서 갱신까지 세트로 처리**. 구현은 이미 있던 `useProfileQuery`/`useUpdateProfile`(온보딩이 계속 써서 안 지워져 있었음)을 그대로 재사용, `PreferencesSection`의 "Language" 섹션에 App language 바로 아래 행으로 추가(같은 낙관적 업데이트+실패 롤백 패턴). 두 행이 같은 섹션 헤더 아래 묶인 한 쌍으로 보이도록 `SettingsRow`에 `divider` prop(기본 true)을 추가해 App language 행만 `divider={false}`로 구분선을 껐다.

**설정 모달 설명 문구 — 마침표 전부 제거**: `SettingsRow`의 `description`(작은 회색 설명)과 섹션 상단 서브타이틀(`account_subtitle`/`preferences_subtitle`) 전부 마침표를 뗐다 — 레이블성 문구는 마침표 없음(`docs/guides/ux-writing.md` 규칙)에 맞춘 것. 새로 쓴 `content_language`/`content_language_description` 카피도 대시(—) 없이 다듬었고(Kyle: "대시는 절대 안 씀" — 향후 카피에도 적용할 규칙), ko는 아직 Kyle이 직접 다듬지 않아 en과 동일한 placeholder로 남겨뒀다(이 세션의 기존 관례 그대로).

---

### 2026-07-12 — Space 오버뷰 탭 제품 용어: Thread 유지, Changeset → Changes

`묻기`/`위키`를 정했던 것과 같은 방식(실제 제품 충돌 리서치 → 대안 검토 → 확정)으로 Space 오버뷰의 두 탭(`space.tab_topic`/`space.tab_changesets`) 이름을 다시 검토했다. 개념·코드 용어(Thread/`topics`, Changeset/`changesets`)는 전혀 안 건드리고, 탭에 노출되는 제품 용어만 다뤘다.

**Thread — 그대로 유지, Feed로 안 바꿈**: 처음엔 "이 탭 기본 상태(Topic 필터 없음)는 사실 여러 Topic이 섞인 피드지, 하나의 Thread가 아니다"는 이유로 "Feed"/"피드"를 제안했었다. 그런데 Thread/Feed의 통상적 어감을 되짚어보니(Thread = 연결된 한 가닥, Feed = 서로 무관한 것들이 넓게 모인 것) Kyle이 "Nema는 스레드가 맞다"고 판단 — Nema가 지키려는 게 "느슨하게 모인 콘텐츠 더미"가 아니라 "서로 이어진 지식"이라, 어감상 Thread가 Nema의 정체성에 더 맞다는 결론. 기본 상태의 실제 UI(믹스된 피드)와 이름이 100% 일치하진 않지만, 그 어긋남보다 브랜드 어감이 우선한다고 판단한 사례 — **"실제 UI와 정확히 일치하는 이름"이 항상 최우선 기준은 아니라는 걸 보여주는 근거로 남겨둔다.**

**Changeset → "Changes"(en) / "변경사항"(ko)로 제품 용어 분리**:
- 1차 시도 "Suggestions"/"제안"은 기각됐다 — Kyle이 "이 탭에 들어갈 컨텐츠를 다 보고 제안한 거 맞냐"고 물어서 다시 확인해보니, 이 탭엔 `ingestion`/`relation`(둘 다 승인 대기 "제안"에 맞음) 말고 `revert`(제출=즉시 적용, 승인 대기 단계 자체가 없음)도 있었고, 무엇보다 Closed 목록은 버려진 것까지 **의도적으로 영구 보존**한다(surface-inventory.md "변경셋" 섹션, nema 원칙 "매끄러움이 아니라 충실함"). Grammarly Suggestions·Google Contacts 병합 제안은 처리하면 목록에서 사라지는 일시적 패턴이라 이 영구 보존 원칙과 구조가 반대라 기각.
- 재조사 결과 Gerrit(Google 코드리뷰 툴)의 "Changes"(Open/Merged/Abandoned, 영구 보존, 되돌리기 가능 — Nema 변경셋과 거의 동일한 생애주기)를 발견, 상태를 특정 안 하는 중립적 단어라 Open(대기)·Closed(완료·버려짐·되돌림) 전부를 자연스럽게 감싼다는 점에서 채택.
- 한국어는 "변경이력" 대신 "변경사항"으로 확정 — 이미 이 문서 자체("Space 오버뷰" 섹션)에 "탭 이름은 '변경 이력'이 아니라 '변경셋' — 대기 중인 것은 아직 '일어난' 게 아니라 '이력'이라는 이름과 안 맞음"이라고 기각 사유가 기록돼 있었고, 그 이유가 "Changes"로 바꾼 지금도 그대로 유효하다. 게다가 "변경 이력"은 이미 Digest/Reference 각자의 "..." 메뉴 → 변경 이력 모달(스코프: 항목 하나)에 쓰이고 있어, 탭(스코프: Space 전체)에도 같은 이름을 쓰면 서로 다른 두 기능이 이름까지 겹쳤을 것.
- npm/pnpm 생태계의 실제 `changesets` 툴(버전 관리 자동화 도구, 이 리포 자체가 pnpm 모노레포라 더 직접적인 충돌 우려)과의 충돌도 이번 교체로 자연히 해소됐다.

**Workspace·Space는 그대로 "워크스페이스"·"스페이스" 유지 확정** — 새 한국어 번역을 만들지 않고 기존 자연스러운 외래어 그대로 쓰기로 확인. 이 김에 그동안 영어 placeholder로 남아있던 LNB 섹션 라벨(`workspace.section_workspace`/`section_spaces`)도 실제 한국어("워크스페이스"/"스페이스")로 반영했다 — 이 둘은 이번에 새로 결정한 게 아니라 원래도 확정 용어였는데 ko.json 반영만 밀려 있었던 것.

**구현**: `apps/web/src/lib/tolgee/en.json`/`ko.json`의 `space.tab_topic`(ko: "스레드")·`space.tab_changesets`(en: "Changes", ko: "변경사항")·`space.changesets_empty`(en/ko: "No changes yet.", 탭 이름 변경에 맞춘 표현 통일)를 갱신. `SpaceOverview.tsx`의 `SpaceTab` 타입(`"topic" | "changesets"`)과 컴포넌트 코드는 무변경 — 코드 식별자와 노출 카피를 분리하는 이 세션의 기존 원칙 그대로.

---

### 2026-07-12 — ko.json 전체 placeholder 번역 + Space 탭 빈 상태 정리 + Space 이름·설정 UI 재구조화

**ko.json 잔여 placeholder 48개 전량 번역**: `/check-ux-writing` 체크리스트(해요체·마침표 규칙·용어 통일) 기준으로 en과 동일 값으로 남아있던 `account`/`app`/`auth`/`settings`/`space`/`workspace` 네임스페이스 키를 전부 실제 한국어로 옮겼다. 과정에서 `session.rename`(기존 "이름 바꾸기")과 새로 쓴 `space.rename`("이름 변경")이 같은 개념에 다른 표현을 쓰고 있던 동의어 충돌을 발견해 "이름 바꾸기"로 통일. `settings.theme`("테마")는 Notion·Slack 한국어판 레퍼런스로 재확인 — 이미 맞았음. **스코프 명시(리뷰에서 지적받음)**: 이 48개는 이 라운드 시점에 ko.json에 이미 있던 placeholder 전부다. 이후 `staging` 리베이스로 다른 세션(#385 인테이크 슬라이스)의 신규 `intake.*` 키 6개가 새로 들어왔는데, 그건 이 번역 작업 범위 밖이다(그 슬라이스 자신의 "전체 구현 끝난 뒤 ko 일괄 번역" 단계가 아직 안 왔을 뿐 — `nema-slice-implementation-workflow.md`의 i18n 관례 그대로). 다음 세션은 `intake.*` 잔여 placeholder를 "이 로그가 놓친 것"으로 오해하지 말 것 — 해당 슬라이스 담당이 처리할 몫이다. 다만 `workspace.drafts`(같은 리베이스로 들어온 LNB 라이브 라벨)는 이 PR에서 함께 번역해뒀다.

**Space 탭 빈 상태 — 문구 제거, 워터마크만**: `SpaceEmptyState`에서 `message` prop 자체를 없애고 워터마크 아이콘만 남겼다(Kyle 요청). 유일한 소비처였던 `space.topic_empty`/`space.changesets_empty` i18n 키도 함께 삭제.

**Space 이름 변경 — 미변경 시 저장 비활성화**: `SpaceSettingsForm`(구 `SpaceModalForm` rename 모드)에 `isUnchanged = name.trim() === spaceName` 가드 추가 — 버튼 disabled뿐 아니라 Enter 키 제출도 막아 무의미한 rename 뮤테이션 호출 자체를 방지.

**Space 생성/설정 모달 분리**: 기존 `SpaceModal`/`SpaceModalForm`(create/rename 모드를 하나의 discriminated union으로 공유)을 `SpaceCreateModal`+`SpaceCreateForm`, `SpaceSettingsModal`+`SpaceSettingsForm` 4개 파일로 완전히 분리했다. 이유: 설정 쪽은 앞으로 필드가 늘 것(아이콘·색상 등, `surface-inventory.md` "Space 설정 모달" 섹션이 이미 명시한 확장 방향)이라 지금 합쳐두면 나중에 갈라내기가 더 번거로움 — Kyle 판단으로 지금 갈라둠. 두 폼 사이 중복(Input+에러 처리+Footer 구조)은 의도적으로 허용 — 이 폴더에 이미 `SpaceDeleteBlockedForm`/`SpaceDeleteConfirmForm`처럼 "시나리오별 작은 폼 분리" 선례가 있어 결을 맞춤.

**LNB "..." 메뉴: Rename → Settings**: Linear(Team)·Notion(Teamspace) 레퍼런스 확인 — 둘 다 Space와 비슷한 무게의 컨테이너인데 "..." 메뉴가 진입점인 건 같지만, 실제 이름 변경은 그 안의 별도 설정 화면에서 일어난다(Notion은 거기에 더해 되돌릴 수 있는 "Archive"만 "..."에 직접 노출, 영구 삭제는 아님). Nema의 삭제는 영구·전체 콘텐츠 삭제라 Notion의 archive보다 무거운 액션이지만, 이미 타이핑 확인이라는 강한 안전장치가 있어 "삭제는 그대로 "..." 직접 액션 유지, 이름 변경은 '설정' 진입점 뒤로"로 정리했다(Delete를 설정 모달 안으로 옮기는 것은 필드가 늘어날 때로 유보). `SpaceItemMenu`의 `onRename` prop→`onOpenSettings`, 아이콘 `Pencil`→`Settings`(gear), 라벨 `space.rename`("이름 바꾸기")→`space.settings`("설정")로 교체 — 이제 안 쓰는 `space.rename`/`space.rename_title` 키 삭제, `space.settings`/`space.settings_title`(en: "Settings"/"Space settings", ko: "설정"/"스페이스 설정") 신규.

**이름 입력 필드에 label 추가**: `SpaceCreateForm`/`SpaceSettingsForm` 둘 다 placeholder만 있고 별도 `<label>`이 없었다 — Kyle 지적으로 `htmlFor`+`id` 연결된 `<label>`(`space.name_placeholder` 텍스트 재사용, "Space name"/"스페이스 이름")을 추가하고 placeholder는 뗐다(라벨과 중복이라).

**신규 유저 기본 Space 이름 — "Default" → "My Space"**: 처음엔 "지금 DB에 name이 NULL이라 프론트가 크래시난다"고 잘못 짚었다 — 실제로는 이후 마이그레이션(`20260710070941_space_management_rpcs.sql`)이 이미 `spaces.name`을 NOT NULL로 승격하고 가입 트리거가 리터럴 `'Default'`를 직접 심도록 바꿔둔 뒤였다(더 오래된 `20260611091632_create_spaces.sql`만 보고 판단해 생긴 오류 — 최신 마이그레이션까지 다 확인했어야 함, 이후 세션 교훈으로 남김). 세 가지 대안(A. 리터럴만 교체 B. 가입 시점 로케일 캡처 후 트리거 분기 C. 센티널 문자열 방식 표시 시점 치환) 중 Kyle이 A 선택 — 지금 "Default"도 원래 로케일 무관 하드코딩이었고, B는 이 세션 스코프 밖, C는 사용자가 우연히 같은 문자열로 개명하면 오치환되는 새 버그를 만들 수 있어서. 새 마이그레이션(`20260712230000_default_space_name_my_space.sql`)으로 `handle_new_user()` 트리거 함수의 리터럴을 `'My Space'`로 교체 + 기존에 아직 "Default" 그대로인 Space도 함께 백필(20260710070941의 NULL 백필과 같은 논리 — 사용자가 실제로 "Default"를 의도적으로 고른 경우는 사실상 없다고 판단). `packages/shared`의 `DEFAULT_SPACE_NAME` 상수도 값 맞춰 갱신(SQL 리터럴과 동기화는 여전히 수동, 자동 강제 없음 — 코드 주석에 명시). **이 환경엔 Supabase CLI가 없어 `supabase db reset`으로 실제 적용 검증을 못 했다 — 머지 전 CI/로컬에서 마이그레이션이 깨끗하게 적용되는지 반드시 확인 필요.** 스키마 변경은 없어(함수 body + 1회성 UPDATE) `pnpm supabase:gen-types` 재생성은 불필요 판단.

---

### 2026-07-13 — PR #387 리뷰 반영 + Space 이름 필드 공유 추출

멀티 에이전트 리뷰(code-reviewer·silent-failure-hunter·pr-test-analyzer·comment-analyzer·type-design-analyzer) 결과 반영. 4개 에이전트가 독립적으로 수렴한 Critical 2건 우선 처리, 나머지는 판단해서 선별 반영.

**마이그레이션 UNIQUE 충돌 방어**: `20260712230000_default_space_name_my_space.sql`의 무방비 `UPDATE spaces SET name = 'My Space' WHERE name = 'Default'`가 `spaces_workspace_id_name_key` UNIQUE(workspace_id, name) 제약과 충돌할 수 있었다 — `create_space`/`rename_space`가 임의 이름을 허용해서, 같은 워크스페이스에 "Default"와 "My Space"가 동시에 있으면 실제로 터지는 시나리오. `rename_space`가 이미 쓰는 방어(대상 이름이 그 워크스페이스에 없을 때만)로 고쳤다. staging은 이미 이 마이그레이션을 충돌 없이 적용해버린 뒤라(그 시점엔 실제 충돌이 없었음) 재실행은 안 되지만, 파일을 고쳐뒀으니 프로덕션 첫 적용 때는 안전하다 — staging 전용 마이그레이션은 이미 적용된 뒤에도 고쳐도 된다고 판단(프로덕션에 적용된 마이그레이션을 사후 수정하는 것과는 무게가 다름).

**ko.json 번역 완료 주장 스코프 정정**: "48개 전량 번역"이 리베이스로 새로 들어온 `intake.*` 6개를 놓쳤다는 지적 — 그 키들은 다른 세션(#385) 몫이라 로그에 스코프를 명시했고, 같은 리베이스로 들어온 LNB 라이브 라벨 `workspace.drafts`만 이 PR에서 같이 번역했다("초안 ({count})").

**죽은 코드 정리**: v1 홈 삭제로 유일한 writer(`useStartSession`)를 잃은 `ChatPanel`의 initialMessage/initialMode 라우트 상태 메커니즘 전체와 그 전용 `routeState` 상수/유틸 파일 2개 삭제. 어디서도 안 쓰이는 `DEFAULT_SPACE_NAME` 상수도 제거(마이그레이션 리터럴과 "맞춰 둘 것"이라는 주석만 있고 강제력 없었음).

**문서 교차 참조 보강**: 2026-07-10 "LNB에 홈 항목은 뺐다" 결정에 이번 폴리싱 라운드가 그 후속 슬라이스라는 참조를 추가(문서 자신의 "이전 결정 재도출 방지" 원칙을 스스로 어기고 있었음). `SpaceListItem` 배지 주석이 이미 사라진 WorkspaceMenu 다크모드 fallback을 근거로 들고 있던 것도 실제 근거(색상 실험 후 중립 회귀)로 교체.

**Space 이름 폼필드 공유 추출**: type-design-analyzer가 지적한 "Create/Settings 폼이 이름 검증 로직을 완전히 독립 재구현"은 Kyle과 논의해 별도로 처리 — 겉 모달/폼 분리(제목·Footer·제출 대상)는 "설정 쪽 필드가 미래에 늘어난다"는 이유가 여전히 유효해 그대로 두되, 이름 필드 자체(값·검증·conflict)는 create/rename 둘 다 규칙이 동일해야 하는 부분이라 분리 이유가 안 맞았다. `useSpaceNameField` 훅(상태+검증+conflict 로직)과 `SpaceNameField` 컴포넌트(순수 컨트롤드 프레젠테이션)로 나눠 양쪽 폼이 합성해서 쓰게 만들었다 — `SpaceNameField`를 상태를 내부에 숨기는 방식(ref 기반 imperative API)으로 만들면 `SpaceSettingsForm`의 "이름 미변경 시 저장 비활성화"가 매 키 입력마다 재계산돼야 하는데 부모가 그 값을 못 보게 돼 깨진다는 걸 설계 중 발견 — 그래서 값은 부모(각 Form)가 계속 들고, 컴포넌트는 렌더링만 맡는 컨트롤드 방식으로 확정.

**Space 생성 모달 — 이름 비어있으면 만들기 버튼 비활성화**: `SpaceSettingsForm`의 "미변경 시 저장 비활성화"와 같은 결.

**Space 생성/이름변경 — 낙관적 업데이트 적용 범위, Kyle과 논의 후 둘을 다르게 처리**: 생성 직후 `navigate({to: "/space/$spaceId"})`가 `utils.workspace.bootstrap.invalidate()`(백그라운드 refetch)보다 먼저 끝나면, `SpaceOverview`가 아직 새 Space가 없는 캐시를 보고 "존재하지 않음" 화면을 잠깐 flash하는 실제 글리치가 있었다. 처음엔 생성 응답(`spaceId`)+입력한 이름으로 캐시에 새 항목을 직접 구성해 넣는 안(진짜 낙관적 업데이트)을 검토했으나, Kyle이 "앞으로를 생각하면 괜찮은 자리인가"라고 재확인 — `BootstrapSpace`가 지금은 `{id, name}` 뿐이지만 이미 문서에 "아이콘·색상은 필요성 커지면 추가"라고 명시돼 있어, 그 시점에 클라이언트가 서버 계산값(예: 배정된 색)을 못 채우는 채로 손수 만든 객체를 캐시에 꽂으면 잘못된/기본값 UI가 잠깐 보일 새 버그가 생길 수 있다고 판단. **생성은 그래서 캐시 손수 구성 대신 await-then-navigate로 갔다** — 처음엔 이 await를 `useCreateSpace`(훅) 자체의 `onSuccess`에 넣어 TanStack Query의 콜백 순서(useMutation onSuccess가 mutate-call onSuccess보다 먼저 실행되고 await됨)로 우회시켰는데, Kyle이 "useCreateSpace 쪽에서 await 거는 게 맞아? 사용처 쪽이 아니라?"라고 지적 — 맞는 지적이었다. 이 대기는 "생성 직후 그 Space로 바로 이동한다"는 `SpaceCreateForm`만의 사정이지 Space 생성이라는 훅 자체의 책임이 아니라서, 다른 미래 소비처(예: 생성만 하고 이동은 안 하는 흐름)까지 이 지연을 암묵적으로 강제하면 안 됐다. `useCreateSpace`는 원래의 단순한(await 없는) invalidate로 되돌리고, `SpaceCreateForm`이 `trpc.useUtils()`를 직접 받아 자기 `onSuccess`(navigate 바로 앞)에서 명시적으로 `await utils.workspace.bootstrap.invalidate()`하도록 옮겼다 — 훅의 자체 invalidate와 중복 호출되지만 TanStack이 같은 쿼리 키의 동시 refetch를 dedupe해 실제로는 한 번만 나간다.

**이름변경은 반대로 진짜 낙관적 업데이트를 적용**: 기존 캐시 항목의 `name` 필드 하나만 덮어쓰는 거라(새 객체를 통째로 만드는 게 아님) 스키마가 커져도 다른 필드가 그대로 보존돼 생성과 같은 위험이 없다고 판단. `useRenameSpace`에 표준 TanStack 패턴 적용: `onMutate`에서 진행 중인 refetch를 취소하고 이전 상태를 스냅샷한 뒤 캐시를 즉시 갱신, `onError`에서 그 스냅샷으로 롤백(이름 충돌 등 실패 시), `onSettled`에서 항상 invalidate로 최종 서버 상태와 동기화. 저장 버튼을 누르는 즉시 LNB 라벨·오버뷰 타이틀이 반영되고, 서버가 거부하면 원래 이름으로 되돌아간다.

**모달은 mutate 완료 후에만 닫는다(의도됨)**: 데이터(캐시)는 낙관적으로 즉시 바뀌어도 모달 자체는 `onSuccess`에서만 닫는다 — Kyle이 이 비대칭을 지적해 확인. 모달은 conflict/validation 에러를 보여주는 유일한 창구라, 제출 즉시(낙관적으로) 닫아버리면 서버가 나중에 거부했을 때 사용자가 그 이유를 볼 방법이 없어진다(조용한 롤백만 보임). 그래서 "가벼운 값(라벨 텍스트)은 낙관적으로, 에러를 보여줘야 하는 모달은 확인 후에"로 의도적으로 갈랐다.

**Space 이름 중복 — 서버 응답 기다리지 않고 클라에서 미리 검사**: `bootstrap.spaces`에 워크스페이스의 모든 Space `id`+`name`이 이미 캐시돼 있다는 걸 활용 — 서버 유니크 제약(`spaces_workspace_id_name_key`)이 `btrim()`만 하고 대소문자는 구분하므로, 클라 쪽도 같은 규칙(trim, 대소문자 구분)으로 비교하는 순수 함수 `isSpaceNameTaken(spaces, name, excludeSpaceId?)`를 만들어 `SpaceCreateForm`/`SpaceSettingsForm` 양쪽에 적용했다(이름변경은 자기 자신을 제외해야 "미변경" 케이스가 오탐되지 않음 — 테스트로 커버). 저장/만들기 버튼을 즉시 비활성화하고 `space.name_taken` 메시지를 보여준다. **서버 쪽 유니크 제약·CONFLICT 처리는 그대로 유지** — `bootstrap`의 10분 staleTime 동안 다른 탭/사용자가 먼저 같은 이름을 썼을 수 있는 레이스 컨디션이 있어, 클라 검사는 빠른 피드백용이지 최종 방어선이 아니다.

**PR 상태**: #387 머지 완료(`staging`, merge commit `be357694`). 마이그레이션(`20260712230000_default_space_name_my_space.sql`)도 `/migrate`로 staging에 적용 완료. **다음 라운드**: 여전히 유효한 건 2026-07-12 폴리싱 1라운드의 "Space 메인 콘텐츠(오버뷰 피드)로 이동 예정" — `SpaceOverview`의 스레드/변경사항 탭은 아직 `SpaceEmptyState` 스텁뿐, 실제 피드 구현은 이번 라운드에도 안 함.

---

### 2026-07-13 — Space 이름변경 낙관적 업데이트 철회 (직전 결정 번복)

바로 위 PR #387 항목의 "이름변경은 반대로 진짜 낙관적 업데이트를 적용"을 철회 — `useRenameSpace`를 `onMutate`/`onError`/`onSettled` 낙관적 갱신에서 `useCreateSpace`와 같은 단순 `onSuccess` invalidate로 되돌렸다(캐시를 먼저 안 바꾸고, 서버 응답 후에만 반영).

Kyle 판단: (1) **Space는 폴더보다 리포지토리에 가까운 무게감**으로 다뤄야 한다 — 폴더 이름 바꾸듯 즉시 반영되는 가벼운 경험보다, 실제 서버 반영을 기다리는 편이 이 단위의 무게에 맞는다. (2) **CRUD 경험의 일관성** — 생성(C)은 `BootstrapSpace` 스키마 확장 위험 때문에 이미 await-then-navigate(비낙관)로 가 있는데, 수정(U)만 낙관적이면 같은 도메인 안에서 삭제(D, 이미 확인 후 진행)·생성과 다르게 수정만 "먼저 바뀌고 실패하면 되돌아가는" 경험이 되어 CRUD 전체의 체감이 어긋난다. **캐시가 즉시 안 바뀌므로 저장 버튼 클릭 후 서버 응답까지의 지연이 다시 보인다** — 이건 회귀가 아니라 위 판단에 따른 의도된 트레이드오프.

---

### 2026-07-13 — Space 이름 빈값도 중복처럼 실시간 에러 표시 + `useSpaceNameField` 단순화

생성/설정 폼 둘 다 이름이 비어있을 때 제출 시도(Enter·버튼 클릭) 후에만 에러가 뜨던 것을, 중복 이름 체크와 동일하게 **입력값이 바뀔 때마다 즉시 계산**되도록 바꿨다(`isEmpty` 파생값을 `nameError` 우선순위 분기 — 빈값 > 중복 — 에 추가).

**단, 생성 모달은 최초 진입 시 이름이 원래 빈 문자열이라, 위 규칙을 그대로 적용하면 모달을 열자마자(아무것도 안 쳤는데) 에러가 바로 보이는 문제가 있었다** — 중복 체크는 사용자가 실제로 값을 입력해야만 조건이 참이 될 수 있는 구조라 이 문제 자체가 없었는데, 빈값 체크는 시작부터 조건이 참이라 다르다. Kyle 확인 후 "입력을 시작한 뒤부터만 표시"로 확정 — `useSpaceNameField`에 `touched`(첫 `handleChange` 호출 시 true) state를 추가해 `nameError`의 빈값 분기를 `touched && isEmpty`로 게이팅했다. 제출 버튼의 `disabled`는 `touched`와 무관하게 계속 `isEmpty` 하나로 막는다(에러 문구 노출 시점만 늦추는 것이지, 제출 자체를 막는 로직은 그대로).

**`useSpaceNameField`의 `validate()`/`validationError` 제거**: 위 변경으로 빈값·중복 둘 다 각 Form이 실시간으로 직접 계산하게 되면서, 훅이 갖고 있던 "제출 시점에만 트리거되는" `validate()`(트림+빈값 체크+에러 세팅)가 완전히 죽은 코드가 됐다 — 각 Form은 이미 렌더 시점에 계산해둔 `trimmedName`을 그대로 mutate에 넘기면 되고(제출 전에 `isEmpty`로 이미 막았으니 재확인 불필요), 에러 메시지도 Form 레벨의 `nameError`가 전담한다. 훅은 이제 `name`/`handleChange`/`hasConflict`/`touched`/`markConflictIfNameTaken`만 남아 순수하게 "필드 상태 + conflict 표시"만 책임진다.

---

### 2026-07-13 — CRUD 뮤테이션 로딩 피드백 표준화: 공통 `useMutation` + disabled·지연 후 텍스트 스왑

**규칙**: Nema의 CRUD 뮤테이션 제출 버튼은 스피너 없이 **"disabled + ~250ms 지연 후 '-ing' 텍스트 라벨 스왑"**으로 통일한다. 250ms 안에 끝나는 요청은 라벨이 아예 안 바뀌고 지나간다(깜빡임 방지). 근거: GitHub Primer(공식 문서, 아이콘 슬롯 스피너 방식)·NN/g·LogRocket 등 외부 UX 리서치가 공통으로 "200ms~1초 미만은 로딩 표시가 오히려 소음"이라 가리킴 — 다만 Nema는 아이콘 스피너 대신 텍스트 스왑을 표준으로 확정(Kyle의 "스피너 안 씀" 원칙에 더 맞고, 이미 있던 `account.delete_deleting` 패턴을 승격한 것에 가까움). `SignInPage`(매직링크 전송)의 아이콘 스피너는 인지된 유일한 예외로 남겨둠(로그인은 다른 무게감의 플로우, 안 건드림). 조회(R)는 그대로 스켈레톤 유지 — 콜드 스타트 쿼리는 네트워크 왕복으로 이미 250ms를 넘기는 경우가 많고 캐시가 재방문 플리커를 막아줘 뮤테이션만큼 자주 겪는 문제가 아니며, `useSuspenseQuery`(실사용 중 — `useSessionQuery`/`useMessageListQuery`)는 로딩을 Suspense 경계의 `fallback`이 담당해 뮤테이션과 같은 방식으로 wrapping 자체가 안 됨 — 그래서 이 최적화는 뮤테이션 전용이다.

**구현**:
- `usePendingAfterDelay(isPending, delayMs=250)`(`apps/web/src/hooks/usePendingAfterDelay.ts`) — `isPending`이 지연 시간 넘게 유지될 때만 `true`를 반환하는 순수 타이머 훅(구현 자체엔 tRPC/데이터 인식 없음). 대화로만 판단하다 한때 `lib/tanstack-query/`(→`useMutation`과 같은 폴더)로 옮겼었는데, `/create-pr`의 컨벤션 검사가 `apps/web/docs/conventions.md`의 "Folder Classification" 표를 근거로 되짚어줬다 — `lib/`는 "외부 서비스 클라이언트 래퍼" 전용이고 "순수 유틸리티 함수"는 명시적으로 제외, `hooks/`는 "feature-agnostic 커스텀 훅". 이 훅은 외부 서비스 의존이 전혀 없는 순수 타이머라 `hooks/`가 문서상 맞는 자리 — **재사용 가능성 논쟁(hover-intent 등) 없이 "외부 서비스에 의존하는가" 하나로 간단히 정리되는 문제였다.** `useMutation`(tRPC 프로시저를 실제로 감싸는 래퍼)은 이 기준으로도 `lib/tanstack-query/`가 맞다. **교훈: 폴더 배치는 대화로 추론하기 전에 `apps/web/docs/conventions.md`의 Folder Classification부터 먼저 확인할 것.**
- `useMutation(procedure, options)`(`apps/web/src/lib/tanstack-query/useMutation.ts`, `index.ts`에서 재노출) — tRPC 프로시저를 그대로 호출하고 결과에 `isPendingAfterDelay`를 얹어 반환하는 공통 래퍼. **이름을 tRPC/TanStack의 원래 `useMutation`과 동일하게 지어서, 이 앱에서 뮤테이션을 만들 땐 이거 하나만 쓰는 단일 진입점으로 삼는다**(`trpc.xxx.useMutation({...})` 직접 호출은 이제 안 함 — `useMutation(trpc.xxx, {...})`로 대체). 위치는 `lib/tanstack-query/`(기존 전역 `mutationCache` 인프라와 같은 폴더) — feature-agnostic 상호작용 훅이 아니라 "우리 뮤테이션이 앱 전체에서 어떻게 동작하는가"에 대한 데이터 레이어 인프라라서.
  - `procedure.useMutation(options)`처럼 인자로 받은 값의 메서드를 훅으로 호출하는 형태라 `react-compiler/react-compiler` 린트가 오탐 — `procedure`가 항상 `trpc.xxx` 고정 프록시 참조라 안전하다는 이유를 달아 해당 줄만 `eslint-disable-next-line`(`useScrollAnchor.ts` 선례와 같은 패턴).
  - **반환 필드명은 `isPendingAfterDelay`**(중간에 `showPending`→`showPendingLabel`→`pendingAfterDelay`로 몇 차례 조정 후 정착). `disabled`는 반드시 `isPending`(즉시)으로 걸고 `isPendingAfterDelay`는 라벨 표시에만 쓴다 — 후자로 `disabled`를 걸면 지연 구간(최대 250ms) 동안 중복 클릭이 새는 실제 버그가 된다. "Label" 같은 특정 UI 형태를 이름에 박지 않고(나중에 라벨이 아닌 다른 표현으로 쓰일 수 있어서) `is`로 시작해 이 저장소의 다른 boolean(`isPending`/`isEmpty`/`isDuplicate`) 명명 관례와도 맞췄다.

**적용 범위(v2 표면 뮤테이션 훅 전수, dev-harness·devtools·레거시 v1 세션 제외) — 6곳**: `useCreateSpace`/`useRenameSpace`/`useDeleteSpace`/`useUpdateProfile`/`useDeleteAccount`(각각 `SpaceCreateForm`/`SpaceSettingsForm`/`SpaceDeleteConfirmForm`/`OnboardingModal`/`AccountDeleteFlow`가 소비) + `useCreateSource`(intake — `SourceComposer`가 아이콘 전용이라 지금 당장 라벨로 보여줄 자리는 없지만 훅 레이어엔 `isPendingAfterDelay`가 있음).

**i18n — action 라벨을 `common`으로 통합**:
- `-ing`형 pending 라벨(`creating`/`saving`/`deleting`)은 Space 관련 문구가 없는 순수 범용 카피라 `common`에 둔다.
- 기본 상태 라벨 `delete`/`create`/`save`도 `common.delete`/`common.create`/`common.save`로 통합했다 — `delete`는 `space.delete`/`session.delete`가 이미 완전히 같은 값이라 실제 중복 근거가 있었고, `create`/`save`는 소비처가 각 1곳뿐이라 증명된 중복은 없었지만 Kyle이 일관성을 우선해 함께 합치기로 결정했다(다음 세션은 "왜 증명된 중복 없이 공통화했지"라고 재도출하지 말 것 — 의도적 선결정).
- `settings.start_pending`("Getting started...")과 `account.delete_deleting`("Deleting your account...")은 각자 특정 맥락(온보딩 완료, 계정 전체 삭제라는 고위험 액션의 의도적 구체적 카피)이라 local로 유지 — 범용화 대상 아님.

---

### 2026-07-13 — 다크 모드 brand 컬러 정합성 감사

**원인**: `packages/weave/src/tokens/index.css`의 `--brand`/`--brand-fg`가 `.dark`에서 재정의되지 않는다(`--brand-hover`/`--brand-accent`/`--brand-tint`는 재정의됨). 그래서 이 두 변수를 직접 쓰는 클래스(`bg-brand`/`border-brand`/`text-brand-fg` 등)는 각 컴포넌트가 `dark:` override를 따로 안 넣으면 다크에서도 라이트와 같은 teal을 그대로 보여준다. 전수 조사(웹서치 아님, 코드 grep) 결과 8곳에서 이 상태로 방치돼 있었다.

**규칙 — 판단 기준은 "지속되는 정체성 신호냐, 일시적 인터랙션 상태냐"**:
- **정체성 신호(brand 유지)**: 전역 tab 포커스 링(`*:focus-visible`, 키보드 내비게이션 시 항상 같은 색으로 "여기"를 표시). `Input`의 자체 포커스 보더도 처음엔 같은 논리로 유지하려 했으나, Kyle이 "탭 포커스 링과 인풋 자체 포커스는 다르게 취급"하기로 정정 — 인풋 포커스는 아래 중립 처리로.
- **일시적 인터랙션 상태(중립 톤 `fg-primary`로 override)**: `Checkbox` checked, `Avatar` fallback 이니셜, `DevToolbar` 프리셋 토글 active(개발자 전용이지만 통일성 위해 포함), `TabbedPanel` 드래그 중 탭 삽입 위치 표시 보더, `ResizeHandle`(스플릿뷰) hover/active/focus 배경. 전부 `Button` primary가 이미 쓰던 `dark:bg-fg-primary dark:text-surface-base`(또는 `border`/`text` 변형) 패턴 재사용 — 새 토큰 없음.
- **`Input` 자체 포커스 보더**: 위 두 범주와 또 달라서 별도 처리 — 처음엔 `dark:focus-visible:border-fg-primary`로 갔다가, Kyle이 "더 얇고 연한 색"을 요청해 `dark:focus-visible:border-fg-tertiary/70`로 조정(더 옅은 토큰 + 불투명도 인하로 "얇아 보이는" 효과, 실제 border-width는 1px 그대로).
- **텍스트 선택 하이라이트**(`selection:bg-brand`, `Input`): 커스텀 클래스를 아예 제거하고 브라우저 네이티브 선택색을 쓰기로 함(포커스/인터랙션 상태 어느 쪽도 아닌 별개 affordance라는 판단).

**스코프에서 제외**: `RetrievalMessage`/`SidePanel`/`RenameInput`(전부 `features/session/`, v1 레거시) — "v1 잔재는 무시한다"는 기준으로 스킵. `TabbedPanel`/`ResizeHandle`은 지금 v1이 쓰고 있지만 `components/ui/`의 공용 프리미티브(v2 재사용 예정)라 스킵 대상에서 제외하고 같이 고쳤다.

**시각 검증**: 실제 화면에 없는 것(Checkbox 미사용, Avatar fallback은 프로필 사진 있는 계정이라 안 보임, TabbedPanel/ResizeHandle은 v1 세션이 하나도 없어 라우트 자체가 없음)은 `SpaceOverview.tsx`에 임시 디버그 프리뷰 블록을 추가해 브라우저로 직접 확인 후 삭제(커밋 안 됨, diff 없음 확인). Input 포커스 보더/선택 하이라이트는 실제 Space 설정 모달에서 스크린샷으로 확인.

---

### 2026-07-13 — 초안 관리 2차 슬라이스: 취소·삭제·수동 추출 실행

`intake-flow.md` "초안 관리" 4케이스(처리 중 취소, 초안에서 Source 삭제, 처리 중 액션 잠금, 초안에서 Digest 추출 실행)만. Space 재지정·제목편집·실패/결과없음 재시도는 여전히 다음 슬라이스(2026-07-12 세션 결정 그대로). BE(취소·삭제·수동 실행 mutation 3개 + `digestion_status` enum 확장)는 같은 워크트리에서 다른 세션이 동시 진행 — 착수 시점엔 계약이 없어 예상 이름으로 먼저 짜고, BE 커밋이 워킹 트리에 들어올 때마다 실제 라우터(`source-router.ts`)·스키마(`SourceActionInputSchema`)를 다시 읽어 맞췄다. 최종 확인된 계약: `source.cancelDigestion`/`source.startDigestion`/`source.delete`, 입력은 셋 다 `{ sourceId }`(`SourceActionInputSchema`) — 상태별 허용 여부는 전부 서버 RPC의 WHERE 가드가 판정하므로 클라가 상태를 실어 보낼 게 없다.

- **`draftStatus` 확장 — `cancelled` 추가**: `digestionStatus`가 `pending|completed|failed`(3종)에서 `cancelled` 포함 4종으로 늘어난 게 BE 마이그레이션(`20260713090000_source_digestion_cancel.sql`)의 핵심 — 취소가 필드만 되돌리면 워커 폴링(2초)이 그대로 재클레임해버려서, "재클레임 안 되는 진짜 상태"가 별도 enum 값으로 필요했다고 함(BE 판단, 마이그레이션 주석 참고). FE는 이 4번째 값을 `draftStatus`에 그대로 매핑만 하면 됐다 — `PendingSourceItem.digestionStatus` 타입이 `AppRouter` 추론을 통해 자동으로 반영되니 `types.ts`는 손댈 게 없었다.
- **`isDraftLocked` 헬퍼 신설**: intake-flow.md 케이스 3의 "처리 중 상태에서 액션 잠금"은 `processing`(즉 `digestionStatus==='pending'`) 하나만 해당 — `cancelled`/`failed`/`empty` 셋 다 명세가 말하는 "평범한 대기 상태"라 액션이 열린다. 이 판정을 `DraftCard`에 흩어두지 않고 `utils.ts`에 `draftStatus`와 같이 둬서, 나중에 잠금 조건이 바뀌어도 한 곳만 고치면 되게 했다.
- **`DraftCard`는 분기만, 액션은 하위 컴포넌트로 분리**: `apps/web/docs/conventions.md`의 "2개 이상 독립 상태 그룹은 컴포넌트로 분리" 규칙대로 — 취소 훅(처리 중 전용)과 추출·삭제 훅(+삭제 다이얼로그 open 상태, 평범한 대기 전용)은 상태가 상호 배타적이라 겹치지 않는다. `DraftProcessingActions`(취소)/`DraftIdleActions`(추출+삭제, `DeleteSourceDialog` 포함)로 나누고, `DraftCard`는 `STATUS_META`/`FOOTER_BY_STATUS` 두 `Record` 맵(`docs/guides/conventions.md` "판별자 값 매핑은 Record 우선")으로 상태→배지·상태→풋터 컴포넌트를 고르기만 한다. `failed`/`empty`는 이번에도 풋터가 없음(그대로 유지) — 재시도 액션은 여전히 범위 밖.
- **Space 재지정·제목편집 — 별도 disabled placeholder 버튼을 만들지 않음(내 판단, PM 확인 필요)**: 브리핑은 "처리 중일 땐 이 액션들과 Space 재지정·제목편집도 자리는 잠긴 걸로 표시"였는데, 이 둘은 평범한 대기 상태에서도 아직 버튼 자체가 없다(다음 슬라이스 몫). 잠금 상태에서만 갑자기 등장하는 dead 버튼 4개를 만드는 대신, `DraftProcessingActions`에 공용 캡션 하나(Lock 아이콘 + `intake.draft_locked_reason`, "처리 중엔 편집할 수 없어요")로 4개 액션이 다 잠겼다는 사유를 뭉쳐 전달했다. 두 미구현 액션이 실제 버튼으로 생기면 이 캡션 방식이 맞는지 재검토 필요 — PM 확인 전 임시 판단으로 남겨둠.
- **삭제 확인 다이얼로그 — `DeleteSessionDialog` 패턴 재사용(버튼 확인, 타이핑 확인 아님)**: `SpaceDeleteDialog`(타이핑 확인)와 달리 무게가 가벼운 쪽을 골랐다 — draft 단계 Source는 아직 Digest/Statement 같은 파생물이 없어(결정 #2가 말하는 "복원 시맨틱이 복잡해지는" 케이스가 아님) 실수해도 되돌릴 파급이 작다. BE `deleteSource`는 내부적으로 `trash_source`(소프트 trashed + 30일 purge)를 호출하지만, 복원 UI가 없는 이상(결정 #2) 사용자 경험상 결과는 영구 삭제와 같다 — 다이얼로그 카피("완전히 삭제돼요. 휴지통에 남지 않고, 되돌릴 수 없어요")는 내부 구현이 아니라 사용자가 실제로 겪는 결과를 기준으로 썼다.
- **i18n**: `intake.draft_delete*`/`draft_extract`/`draft_locked_reason` 추가, en 실작성 + ko는 같은 네임스페이스의 기존 컨벤션(2026-07-12 세션, "en과 동일 placeholder") 그대로 계승 — 같은 화면 안에서 일부 키만 실제 한국어로 먼저 쓰면 오히려 일관성이 깨진다고 판단.
- **검증**: 로컬 브라우저 E2E는 생략(PM 지시 — 로컬 인프라가 이 세션에서 안정적으로 안 될 걸로 예상). 대신 `pnpm --filter @nema-io/web typecheck`/`lint`/`test`(utils 8케이스, `cancelled`·`isDraftLocked` 신규 포함)로 확인하고, BE가 워킹 트리에 반영한 최종 라우터·서비스 코드를 직접 읽어 훅의 tRPC 경로명이 실제 계약과 정확히 일치하는지 대조했다.

**amendment(2026-07-13, PR #394 멀티 에이전트 리뷰 반영, FE 항목만)**: BE 쪽(RPC ERRCODE, provider abort-awareness 등)은 별도 처리. FE는 아래 5건.
- `isDraftLocked` 삭제 — 자기 테스트 말고는 아무도 안 부르는 죽은 함수였다(실제 잠금 판정은 `DraftCard`의 `FOOTER_BY_STATUS` 맵이 함). CLAUDE.md "커버리지만을 위한 테스트 금지" 위반이기도 해서 함수+테스트 같이 뺐다. 나중에 정말 쓰는 소비처가 생기면 그때 다시 추가.
- `draftStatus`에 exhaustiveness 체크 추가 — 기존엔 마지막 `if` 없이 캐치올로 `"processing"`을 반환했는데, 이 PR이 실제로 DB enum을 3종→4종으로 늘린 마당이라 5번째 값이 추가될 가능성이 낮지 않다. `model-factory.ts` 등이 쓰는 `never` exhaustiveness 관용구로 바꾸되, FE는 `ChatLifecycleContext.tsx`가 이미 쓰는 쪽(스트리밍 콜백 중간에 throw하면 그 컴포넌트 트리 전체가 죽으므로 조용히 무시)을 따라 throw 대신 `null`(초안 아님 취급) 반환으로 갔다 — 알 수 없는 상태를 "처리 중"(가장 파괴적인 기본값, 액션 잠금)으로 조용히 매핑하던 것보다는, 카드 하나가 목록에서 조용히 빠지는 쪽이 안전하다고 판단.
- `FOOTER_BY_STATUS`를 `STATUS_META`와 같은 강제 수준으로 맞춤 — `Partial<Record<...>>`(failed/empty는 키 자체가 없음)에서 완전한 `Record<DraftStatus, ... | null>`(failed/empty를 `null`로 명시)로 바꿔, 새 상태가 추가될 때 "풋터 없음"을 빠뜨리지 않고 의식적으로 선언하도록 강제.
- 신규 훅 3개(`useCancelSource`/`useDeleteSource`/`useExtractSource`)가 raw `trpc.source.xxx.useMutation`을 직접 호출하고 있었다 — 이 브랜치가 PR #391("CRUD 뮤테이션 로딩 피드백 표준화") 머지 전에 갈라져서 생긴 격차. `origin/staging` 머지로 `useMutation`(`@web/lib/tanstack-query`) 래퍼를 받아와 세 훅 모두 옮기고, `isPendingAfterDelay`로 버튼 라벨을 스왑하게 했다(취소/추출/삭제 각각 "취소 중…"/"추출 중…"/"삭제 중…"). `common.cancelling`(신규, en/ko 실작성 — common 네임스페이스는 이미 #391에서 전체 한국어 작성돼 있어 이 관례를 따름) + `intake.draft_extracting`(신규, intake 네임스페이스 기존 관례대로 en과 동일 ko placeholder) 추가.
- `intake.draft_delete` 키 제거 — PR #391이 `session.delete`/`space.delete`를 `common.delete`로 이미 통합해뒀길래, 이 PR에서 새로 만든 중복 키도 `common.delete`로 맞췄다(다이얼로그 확인 버튼 + 삭제 아이콘 버튼 aria-label 둘 다).
- **참고만, 미반영(PM 확인 후 별도)**: "삭제가 cancelled 상태에만 연결돼 있고 failed/empty는 안 된다"는 지적은 버그가 아니라 기존에 이미 의도적으로 내린 결정(위 `DraftCard` 항목)이라 코드는 안 건드리고, `intake-flow.md`의 "초안에서 Source 삭제" 케이스에 그 범위를 명시하는 참고만 추가했다.

---
