# 디자인 결정 로그

이 문서는 프런트엔드 구현 세션 간에 시각·패턴 일관성을 유지하기 위한 누적 기록이다. MVP IA 재구축(`docs/poc/mvp-wireframe.html`, `docs/blueprints/first-product/functional-spec/`)은 여러 세션에 걸쳐 화면 단위로 진행되는데, 세션마다 매번 "재사용 가능한 게 뭐가 있었지"를 처음부터 다시 조사하면 세션 간 스타일이 갈라지고 같은 판단을 반복하게 된다.

**규칙**: 화면·플로우 구현을 마무리하는 세션은 작업을 끝내기 전에 이 문서 맨 아래에 새 항목을 추가한다 — 어떤 weave/v1 컴포넌트·토큰을 재사용했는지, 새로 만든 프리미티브가 있다면 무엇이고 왜 기존 것으로 안 됐는지를 남긴다. 항목은 시간순으로 쌓이며, 이전 항목을 고치지 않고 새로 추가만 한다(append-only). 뒤 세션은 착수 전에 이 문서를 훑어 이미 내려진 결정을 재도출하지 않는다.

**작성 스코프(2026-07-13 정리)**: 남기는 건 **확정된 규칙과 그 이유**다 — "group-hover 안 쓰면 배경이 죽는다", "danger 톤은 두 군데 따로 선언돼 있다" 같이 안 남기면 다음 세션이 똑같이 재발견해야 하는 것들. **"어떤 라운드를 거쳐 이 결론에 왔는지"(누가 뭘 요청했다가 리뷰에서 바뀌었다는 식의 서사)는 웬만하면 줄인다** — 그건 PR 리뷰 스레드·커밋 히스토리가 원래 담당할 정보고, 여기 계속 쌓이면 문서가 길어질수록 진짜 규칙이 서사에 묻혀 "먼저 읽기"의 신호 대 잡음비가 나빠진다. 백엔드/데이터 아키텍처 판단(쿼리 invalidate 전략, 마이그레이션 안전성 등)은 이 문서(FE 시각·패턴 전용) 스코프 밖 — 결정된 게 아니라 논의만 한 것이면 아예 안 남기고(필요해지면 그때 PR에서 근거로 남김), 결정까지 됐다면 `product-decisions-log.md` 쪽이 더 맞는 자리인지 먼저 확인한다. 기존 항목은 소급 정리하지 않는다(위 append-only 원칙).

**(2026-07-14 추가) 코드 diff만 봐도 재구성되는 내용은 안 남긴다** — 어떤 컴포넌트를 새로 만들었는지, 어떤 클래스·토큰을 적용했는지, 어떤 파일을 옮겼는지 같은 "무엇을 어떻게 바꿨는지"는 diff·커밋이 이미 정확한 원본이다. 여기 남길 건 diff만 봐서는 알 수 없는 것 — **왜 그렇게 했는지, 어떤 대안을 검토했다가 기각했는지** — 뿐이다.

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

### 2026-07-13 — 초안 관리 3차 슬라이스: Space 재지정

`intake-flow.md` "초안에서 Space 재지정" 하나만. BE(`reassign_source_space` RPC, `source.reassignSpace` 프로시저)는 같은 워크트리에서 다른 세션이 먼저 끝내둔 상태로 착수 — `cancel_source_digestion`/`trash_source`와 같은 가드 모양(`status='pending' AND digestion_status <> 'pending'`)에 대상 Space까지 `is_space_member` 이중 체크가 더해져 있었다. 계약 그대로 FE만 얹었다.

- **`listPendingSources`에 `spaceId` 추가**: Space 셀렉트가 "지금 어느 Space에 있는지"를 표시(선택값 프리셀렉트)하려면 `PendingSourceItem`에 현재 Space가 필요했다 — 기존엔 `sources.space_id`를 아예 select하지 않았다. RPC/마이그레이션 변경이 아니라 이미 있는 컬럼을 노출만 하는 거라 BE 슬라이스가 아니라 이 PR에서 같이 처리(BE가 먼저 만들어둔 `source-service.ts`/`source-router.ts` 위에 얹음, 겹치는 훅은 없었음).
- **`/drafts`는 Space 비종속 화면이라는 게 이번에 다시 확인됨**: `source.listPending`이 애초에 space 필터가 없고(RLS로만 격리), 라우트(`/drafts`)도 `/space/$spacePublicId`와 달리 spaceId 파라미터가 없다 — 즉 유저의 모든 Space를 가로지르는 뷰다. 그래서 브리핑에 있던 "재지정하면 현재 Space 화면에서 사라져야 한다"는 걱정은 애초에 해당 없음(재지정 대상도 유저가 멤버인 Space로 한정되니 카드는 계속 `/drafts`에 남고, 셀렉트 표시만 새 Space로 바뀐다) — 별도 invalidate 범위 조정 없이 기존 `listPending.invalidate()` 패턴 그대로.
- **Space 셀렉트 프리셀렉트는 내 판단(PM 확인 필요)**: intake-flow.md의 Then은 "선택하면 재지정된다"뿐, 현재 값을 보여주라는 요구는 없다. 하지만 `weave Select`는 항상 트리거에 현재 선택값을 보여주는 컴포넌트라 값 없이 쓰면 오히려 어색해 보인다 — `spaceId`를 `value`로 넘겨 현재 Space를 프리셀렉트하는 쪽을 기본으로 택함.
- **범위는 cancelled만 — failed/empty 제외**: "초안에서 Digest 추출 실행"/"초안에서 Source 삭제"와 같은 이유(2026-07-13 PR #394 결정 그대로) — 재시도류 액션 전체가 2차 슬라이스 밖이라 `FOOTER_BY_STATUS`(`processing`/`cancelled`만 풋터 있음)를 안 건드림. `DraftIdleActions`에 `spaceId` prop만 추가하고 Space 셀렉트를 그 안에 얹었다.
- **`DraftSpaceSelect` 별도 파일로 분리**: `apps/web/docs/conventions.md`의 "1파일 1컴포넌트" + "훅/상태가 2개 이상 독립 그룹이면 분리" 규칙대로 — `DraftIdleActions`는 이미 추출(mutation)·삭제 다이얼로그(로컬 open 상태) 두 그룹을 갖고 있었는데, 여기에 Space 재지정(`useSpaceList` 쿼리 + `useReassignSourceSpace` 뮤테이션)까지 인라인으로 얹으면 세 번째 독립 그룹이 된다. `DeleteSourceDialog`가 이미 그렇듯 새 그룹도 자기 파일로 뺐다.
- **`useReassignSourceSpace`는 낙관적 업데이트 없이 `onSuccess` invalidate만** — `useCancelSource`/`useDeleteSource`/`useExtractSource`와 같은 패턴. Space 이름변경 쪽 낙관적 업데이트는 2026-07-13에 이미 철회된 결정이라(위 항목 참고) 새 훅에 그 패턴을 다시 들이지 않음.
- **처리 중 잠금 캡션 재검토(2026-07-13 PR #394가 남긴 PM 확인 사항)**: "Space 셀렉트·제목편집이 실제 버튼으로 생기면 공용 캡션 방식이 맞는지 재검토 필요"였는데, Space 셀렉트가 이번에 실제로 생겼다 — 캡션(`intake.draft_locked_reason`)이 액션 이름을 나열하지 않는 일반 문구라 그대로 둬도 무방하다고 판단(내 판단, PM 확인 필요). `DraftProcessingActions.tsx`는 안 건드림 — processing 상태는 `DraftIdleActions` 자체가 안 그려지니 Space 셀렉트도 자동으로 잠긴다.
- **i18n**: `intake.draft_reassign_space`(신규, Select 트리거 aria-label) — en 실작성 + ko는 기존 `draft_*` 관례(en과 동일 placeholder) 계승.
- **검증**: `pnpm --filter @nema-io/server test`(383개, `reassignSourceSpace` BE 테스트 포함) + `pnpm --filter @nema-io/web typecheck`/`lint`/`test`(67개, `PendingSourceItem` fixture에 `spaceId` 추가) 전부 통과. 로컬 브라우저 E2E는 2026-07-13 2차 슬라이스와 같은 이유로 생략 — 이번 세션에서도 확인 안 함.

**amendment(2026-07-13, 멀티 에이전트 리뷰 반영)**: `reassign_source_space` RPC를 두 건 강화.
- **확정 대기 중인 리뷰가 있는 원본 제외**: 기존 가드(`status='pending' AND digestion_status<>'pending'`)는 `digestion_status='completed'`이면서 아직 확정 안 된 ingestion changeset이 있는 상태(=이전 결과가 확정 대기 중인 상태)도 통과시켰다 — `changesets.space_id`는 옮기지 않으므로, 이 상태에서 재지정하면 나중에 그 리뷰가 확정될 때 멤버십 판정과 결과 Digest 생성이 옛 Space 기준으로 어긋난다. `start_source_digestion`이 이미 같은 이유로 이 상태를 배제하고 있어(`EXISTS` 체크), 같은 배제를 여기도 추가(`NM004`).
- **대상 Space 접근권 거부를 별도 에러 코드로 분리**: 상태 가드 실패와 대상 Space 비멤버십을 같은 `NM004`("초안 상태가 바뀌었어요, 새로고침 후 재시도")로 뭉쳐두면, 실제로는 접근권이 없는 시도인데도 새로고침하면 될 것처럼 안내하게 된다 — `space.list`가 10분 staleTime을 가져 방금 스페이스 접근권을 잃은 유저도 그 스페이스가 최대 10분간 셀렉트 옵션으로 남는, 실제로 도달 가능한 시나리오라 더 그렇다. 대상 Space 비멤버십은 다른 RPC의 `insufficient_privilege`와 같은 `42501`로 분리(error-mapper가 이미 "forbidden"으로 매핑). `useReassignSourceSpace`도 실패 시 `space.list`를 invalidate해 stale 옵션이 다음 시도까지 남지 않게 했다.
- `FOOTER_BY_STATUS`의 `{sourceId, spaceId}` 인라인 prop 타입이 `DraftCard`/`DraftIdleActions`/`DraftSpaceSelect` 세 곳에 중복돼 있던 걸 `types.ts`의 `DraftFooterProps`로 추출.

---

### 2026-07-13 — 초안 탭 처리중 표시 색상: 파란색(`status-info`), 노랑/주황 아님

`DraftsNavItem`의 처리중 pulse 점 색상은 `text-status-info`(파랑)로 확정. GitHub Actions·Vercel(Geist Status Dot)류의 "진행중=노랑/주황" 관례를 실제로 조사했으나 기각 — Nema는 `status-warning`(경고 전용 톤)과 색이 겹치면 "그냥 처리중"과 "실제 주의 필요"의 심각도 구분이 흐려진다고 판단, 일반 디자인 시스템(Carbon류)의 "파랑=정보성/진행중" 관례를 따랐다. 이후 세션이 GitHub Actions식 노랑/주황으로 되돌리기 전에 이 트레이드오프를 먼저 확인할 것.

**amendment(2026-07-14, 파랑 결정 번복)**: `text-status-info`(파랑)를 중립톤(`text-fg-tertiary`)으로 교체. `animate-pulse`(투명도 애니메이션) 자체가 이미 "지금 활동 중"이라는 신호라, 그 위에 심각도 색을 얹을 근거가 약하다고 재판단 — AI 프로세싱 UI 레퍼런스(SAP Fiori의 AI progress indicator, GitHub Copilot coding agent)를 확인해보니 둘 다 "진행중"을 색상 심각도가 아니라 전용 애니메이션·아이콘+텍스트로 표현하고 있었다. 같은 컴포넌트의 `failed`(빨간 삼각형, `status-error`)는 그대로 유지 — "색은 실제 주의가 필요할 때만 쓰고, 처리중 같은 루틴 활동은 무채색"으로 원칙을 좁혔다. 노랑/주황 기각 근거(위 문단)는 그대로 유효하나(오히려 재조사 결과 GitHub·Vercel도 실제로는 노랑/주황을 경고와 겸용 중이라는 게 확인돼 강화됨), 최종적으로는 파랑도 같은 논리 연장선에서 재고 대상이 됐다.

---

### 2026-07-13 — 초안 관리 3차 슬라이스: Source 제목 자동 채움 + 편집

`intake-flow.md` "초안에서 Source 제목 편집" 1케이스(product-decisions-log.md #15 결정 반영). BE(`sources.title` 컬럼 + digest-generation LLM 콜 출력에 `sourceTitle` 얹기 + `update_source_title` RPC)는 같은 워크트리에서 다른 세션이 동시 진행 — 착수 시점엔 계약이 없어 예상 이름(`source.updateTitle`, 입력 `{sourceId, title}`)으로 먼저 짜뒀고, BE 착지 후 대조 결과 이름·형태 모두 정확히 일치해 FE 쪽 수정은 없었다.

- **제목 표시 위치 — 본문 미리보기 위, 배지 아래**: `title`이 있으면 굵게, 없으면(아직 인제스천 전) `intake.draft_title_placeholder`("Generating title...")를 옅은 톤(fg-tertiary, italic)으로 대체 — 결정 #15의 "제목 미충전 시 placeholder" 그대로. digestionStatus가 `completed`(empty 포함)면 판단 없는 글도 title은 항상 채워지므로(BE 쪽 결정), null인 케이스는 사실상 processing/cancelled/failed뿐이다.
- **편집 액션 게이팅 — Extract/Delete 풋터(`FOOTER_BY_STATUS`)와 묶지 않고 `DraftCard`에서 독립 판정**: `canEditTitle = status !== "processing"`으로 cancelled·failed·empty 전부에서 열린다. Extract/Delete는 2차 슬라이스에서 "재시도 액션은 범위 밖"이라는 이유로 의도적으로 cancelled만 연결했지만(design-decisions-log.md 2026-07-13 "초안 관리 2차 슬라이스" 참고), 제목 편집은 그 스코프 제한의 근거(재시도 액션 여부)가 애초에 없고 BE 가드(`update_source_title` RPC의 WHERE)도 `digestion_status<>'pending'` 전체를 허용한다 — Extract/Delete 풋터와 같은 `Record<DraftStatus, ...>`에 억지로 끼워 넣으면 failed/empty에서 title 편집만 되고 풋터는 없는 조합을 표현할 수 없어서, 펜슬 버튼을 풋터와 별개로 제목 옆에 직접 뒀다.
- **처리 중 잠금 — 코드 변경 없음(기존 캡션이 이미 포괄)**: `DraftProcessingActions`의 공용 캡션(Lock 아이콘 + `intake.draft_locked_reason`)이 "이 액션들과 Space 재지정·제목편집도 잠긴 걸로"라는 브리핑을 이미 커버하도록 2차 슬라이스에서 설계돼 있었다(그때는 검증 대상이 없어 미체크였던 판단) — 이번에 제목 편집 버튼이 실제로 생기면서 그 판단을 재확인: `canEditTitle`이 processing에서 false라 펜슬 버튼 자체가 안 보이고, 별도 disabled 버튼을 추가하지 않는 기존 방식이 그대로 맞았다.
- **다이얼로그 패턴 — `DeleteSourceDialog`/`AccountDeleteFlow` 확인 다이얼로그 계열 재사용, 인라인 편집 안 씀**: `EditSourceTitleDialog` 신설(작은 Dialog + 라벨 있는 `Input` 1개 + Cancel/Save). 카드가 좁은 리스트 아이템이라 인라인 편집은 레이아웃 시프트·별도 확정 상태가 필요한데, 이 화면이 이미 Dialog 확인 패턴(삭제)을 쓰고 있어 그 결을 따르는 게 더 일관적이라고 판단. 다이얼로그는 열림 상태만 토글되고 언마운트되지 않으므로, `onOpenChange(true)` 시점에 입력값을 현재 `title`로 재초기화해 이전에 취소한 입력이 다음 오픈에 남지 않게 했다.
- **유효성 검사 — trim 후 빈 값이면 Save만 비활성화, 실시간 에러 문구 없음**: `useSpaceNameField`류의 `touched` 상태까지는 이 다이얼로그 스코프에 과하다고 판단해 안 씀 — Save 버튼 disabled 하나로 "빈 제목 제출 불가"를 막는다. `maxLength`는 BE `SOURCE_TITLE_MAX_LENGTH`(200, `@nema-io/shared`)를 그대로 재사용(`SpaceNameField`가 `SPACE_NAME_MAX_LENGTH`를 쓰는 것과 같은 패턴).
- **저장 반영 — invalidate 기반(낙관적 업데이트 아님)**: `useUpdateSourceTitle`은 `useExtractSource`/`useDeleteSource`와 같은 결로 `onSuccess`에서 `listPending`을 invalidate만 한다. Space 이름변경이 한때 진짜 낙관적 업데이트였다가 "무게감 있는 CRUD는 서버 확인 후 반영"으로 철회된 선례(위 2026-07-13 "Space 이름변경 낙관적 업데이트 철회" 항목)를 따라, 굳이 먼저 낙관적으로 갈 이유를 만들지 않았다.
- **i18n**: `intake.draft_title_placeholder`/`draft_title_edit_action`/`draft_title_edit_label`/`draft_title_edit_title` 신규, en 실작성 + ko는 intake 네임스페이스 기존 관례대로 en과 동일 placeholder. Save/Cancel/Saving은 새 키를 안 만들고 기존 `common.save`/`common.cancel`/`common.saving` 재사용(PR #391의 "action 라벨은 common으로 통합" 결정 계승).
- **검증**: 로컬 브라우저 E2E는 PM이 직접 진행하기로 해 이번 세션에서는 생략 — `pnpm typecheck`/`lint`/`test`(모노레포 전체, server 385 + web 67 케이스, `utils.test.ts`의 `buildSource` title 필드 추가 포함)로 확인하고, BE가 최종 착지시킨 `source-router.ts`/`source-service.ts`/`schemas/source.ts`를 다시 읽어 훅·다이얼로그의 트림/타입이 실제 계약(`SourceUpdateTitleInputSchema`)과 정확히 일치하는지 대조했다.

**amendment(2026-07-13, 멀티 에이전트 리뷰 반영)**: 세 건.
- **수동 편집한 제목이 재인제스천에 덮어써지던 무음 데이터 유실 수정**: `complete_source_digestion`/`create_ingestion_review` 둘 다 `title` 컬럼을 무조건 덮어써서, cancelled·failed·empty 상태에서 유저가 제목을 고친 뒤 "추출 실행"으로 재시도하면 워커가 새로 뽑은 제목이 그 편집을 아무 신호 없이 지웠다. `sources.title_edited`(boolean, 기본 false) 컬럼을 추가해 `update_source_title`이 세우고, 두 완료 RPC는 `CASE WHEN title_edited THEN title ELSE p_title END`로 사람이 정한 값을 지킨다.
- **`draft_title_edit_required` 죽은 i18n 키 제거**: 실시간 에러 문구 없이 Save 버튼 disabled만으로 빈 제목 제출을 막는 설계(위 "유효성 검사" 항목)와 모순되게, 어디서도 안 쓰이는 키가 en/ko 둘 다에 남아있었다 — 삭제.
- **`useUpdateSourceTitle`에 `meta: { skipGlobalToast: true }` 추가**: `EditSourceTitleDialog`가 이미 인라인 `Alert`로 실패를 보여주는데 이 플래그가 없어 전역 토스트(닫기 전까지 안 사라짐)까지 중복 노출됐다 — `useDeleteAccount`가 같은 이유로 이미 쓰고 있던 패턴을 그대로 적용.
- 마이그레이션 파일명이 PR #399(Space 재지정, `20260713100000_source_space_reassign.sql`)와 같은 타임스탬프였던 걸 `20260713110000`으로 bump해 정리. 헤더 주석의 zod 강제 지점 인용도 `digest-generation.ts`→`digest-review.ts`로 정정(실제 코드는 처음부터 맞았음, 주석만 오기).

---

### 2026-07-14 — 초안 관리: failed·empty 재시도 액션 연결 (intake 흐름 마지막 조각)

`intake-flow.md` "Digest 추출 실패"/"Digest 추출 결과 없음" 두 케이스의 Then #3(재시도 액션)만. BE `start_source_digestion`은 cancelled·failed·completed(결과없음) 셋 다 이미 재클레임 가능하도록 만들어져 있었고(PR #394), FE `useExtractSource`도 애초에 그 셋을 모두 염두에 두고 하나로 만들어져 있었다(2026-07-13 "초안 관리 2차 슬라이스" 항목의 훅 주석 참고) — 이번 슬라이스는 `DraftCard.tsx`의 `FOOTER_BY_STATUS` 맵에서 failed/empty를 `null`→`DraftIdleActions`로 바꾸는 한 줄, 그리고 그 위 낡은 주석("2차 슬라이스로 미룸") 정리가 전부다.

- **재시도 버튼 하나만이 아니라 `DraftIdleActions` 전체(추출 실행·삭제·Space 재지정)가 열림 — 문제 없다고 판단, PM 확인 없이 진행**: intake-flow.md의 Then 문구는 "Digest 추출 실행 액션으로 다시 시도할 수 있다"뿐이라 재시도 버튼만 여는 것도 문구상 가능했지만, `DraftIdleActions`가 애초에 상태 무관 컴포넌트(`sourceId`/`spaceId`만 받음)라 재시도만 쏙 빼서 넣으려면 새 컴포넌트가 필요했다. 대신 이미 확립된 선례를 따름: (1) cancelled 상태가 이미 이 컴포넌트 전체를 풋터로 쓰고 있고, (2) 제목 편집(`canEditTitle`)은 2026-07-13 "3차 슬라이스: 제목 편집" 항목에서 이미 "failed/empty를 cancelled와 동일한 평범한 대기 상태로 취급 — 재시도 스코프 제한의 근거가 애초에 없다"고 명시적으로 판단해뒀다, (3) 서버 가드(`start_source_digestion`/`trash_source`/`reassign_source_space`)가 전부 `digestion_status<>'pending'` 기준이라 failed/empty를 cancelled와 다르게 취급할 서버 쪽 근거도 없다. 세 근거가 일관되게 같은 방향을 가리켜 PM 확인 없이 그대로 진행 — 문제가 드러나면 되돌리기 쉬운 변경(맵 한 줄)이라는 점도 고려함.
- **케이스 코드 변경 없음, 문서만 갱신**: `intake-flow.md`의 두 케이스에 확정 노트 추가, 이 항목 신설. `DraftCard.tsx` 자체는 이미 이번 슬라이스 이전부터 컴파일 가능한 상태였다(빠진 건 매핑 두 줄뿐).
- **테스트 변경 없음**: `DraftCard`/`DraftIdleActions`엔 컴포넌트 테스트가 없고(`utils.test.ts`는 `draftStatus`/`isDraftItem` 순수 함수만 다룸), 이번 변경이 그 함수들의 동작을 바꾸지 않아 기존 스위트로 충분하다고 판단.
- **검증**: `pnpm --filter @nema-io/web typecheck`/`lint`/`test`(67개, 전부 기존 케이스 그대로) 통과 확인. 로컬 브라우저 E2E는 앞선 슬라이스들과 같은 이유로 생략.

---

### 2026-07-14 — Topic 관리: 이름변경/아카이브/되살리기 RPC (browsing-flow.md BE 계약)

`browsing-flow.md` "Topic·Tag 관리" 섹션 4케이스(칩 클릭→팝오버, 이름변경, 아카이브, 되살리기) 중 BE 계약만 착지 — Tag(#404)를 Space 스코프로 미러링한 `update_topic`/`archive_topic`/`restore_topic` RPC + `topics.status` 컬럼. FE는 실제 "Digest 상세 편집 팝오버"가 아니라 `/dev` 확인용 하니스뿐이라 케이스 체크는 전부 미룸(각 케이스 상세의 범위 참고 참고).

**amendment(2026-07-14, 멀티 에이전트 리뷰 반영)**:
- **`update_topic`/`archive_topic`/`restore_topic`에 `USING ERRCODE` 추가**: 원래 코드 없이 `RAISE EXCEPTION`만 쓰고 있어, `toSupabaseErrorCode`가 인식 못 하고 전부 `query_failed`(`DB_QUERY_FAILED`, i18n `error.default`="Something went wrong")로 뭉개졌다 — 정상적인 이름 중복·이미 처리된 상태 재클릭까지 매번 Sentry에 캡처되는 부작용도 있었다. `NM005`(상태 가드 실패, source의 `NM004`와 같은 결)/`NM006`(이름 중복, space의 `NM003`과 같은 결)으로 분리하고 `EXPECTED_DOMAIN_CODES`에 등록 + 전용 i18n 메시지 추가.
- **`useUpdateTopic`/`useArchiveTopic`/`useRestoreTopic`에 `skipGlobalToast` 추가**: `TopicRow`가 이미 인라인으로 에러를 보여주는데 빠져 있어 전역 토스트까지 중복 노출됐다 — `useUpdateSourceTitle`(2026-07-13 항목 참고)과 같은 이유, 같은 수정.
- **`fetchRegistries`의 `status='active'` 필터에 회귀 테스트 추가**: 이 PR이 고친 실제 버그(재사용 제안 후보에 archived Topic이 새던 것)인데 테스트가 없었다 — `digestion.test.ts`에 topics 쿼리의 `eq` 인자를 기록하는 스텁을 추가해 필터 자체를 검증하게 함.
- **알려진 한계, 이번 PR에서 미반영(별도 트래킹 필요)**: Topic을 실제로 만드는 세 find-or-create 경로(`write_ingestion_review_changes`/`confirm_digest_edit`/`confirm_draft`, 전부 `ON CONFLICT (space_id, name) DO UPDATE`)가 `status`를 안 본다 — archived 이름으로 재생성을 시도하면 status는 archived로 남은 채 새 링크만 조용히 붙는다(마이그레이션 헤더 주석에 명시). Tag의 동일한 find-or-create 경로에도 이미 있던 결함이라 이번 PR에서 Topic만 따로 고치지 않기로 함 — Tag·Topic 양쪽을 함께 다룰 별도 작업 필요.
- **알려진 한계, 문서화만 함(코드 미반영)**: `listTopics`(topic.list)가 상태 필터 없이 전체를 반환하는 건 의도된 설계(스레드 피드 Topic 필터가 archived도 계속 선택 가능해야 함)지만, 이 목록이 `statement-search.ts`의 코스 스코핑(묻기 기능의 쿼리 라우팅 후보)에도 그대로 흘러들어간다 — 즉 archived Topic이 재사용 제안에서는 빠지지만 라우팅 후보에서는 안 빠진다. 아직 Topic 아카이브가 `/dev` 하니스로만 가능해 실사용자 경로로는 도달 안 하지만, 실제 Digest 상세 팝오버가 랜딩하면 재검토 필요.

---

### 2026-07-14 — Reference 삭제: trashed 전환 + 30일 배치 완전 삭제

`browsing-flow.md` "Reference 삭제 — 인용 없음/있음" 2케이스 중 BE 계약만 착지 — `source_status_v2`와 같은 모양으로 `reference_status`에 `trashed` 추가, `trash_reference`(active→trashed 전이) + `purge_expired_references`(30일 보관 배치, pg_cron 매일 실행) RPC. Reference는 임베딩 대상이 아니라 벡터 정리 큐 연동 없이 순수 관계형 DELETE + CASCADE로 끝남. FE는 `/dev` 하니스뿐이라 케이스 체크는 전부 미룸(각 케이스 상세의 범위 참고 참고).

**amendment(2026-07-14, 멀티 에이전트 리뷰 반영)**:
- **`trash_reference`에 `USING ERRCODE` 추가**: Topic RPC(바로 위 항목)와 정확히 같은 실수를 이 PR도 반복했다 — 이 브랜치가 Topic의 리뷰 반영 커밋보다 먼저 갈라져서 그 수정을 픽업할 기회가 없었다. `NM007`(source의 `NM004`·topic의 `NM005`와 같은 결)로 분리하고 `EXPECTED_DOMAIN_CODES`+i18n 메시지 추가. 가드 실패 테스트도 `.rejects.toThrow()`(무엇이든 던지면 통과)에서 `.rejects.toMatchObject({code: "reference_state_changed"})`(정확한 분류까지 확인)로 강화해, 이 클래스의 버그가 다시 생기면 테스트가 잡도록 함.
- **`getReferenceCitingDigests`를 direct select에서 전용 RPC(`get_reference_citing_digests`)로 교체**: 기존 구현은 `digest_references`의 SELECT RLS(citing Digest가 속한 **Space** 멤버십 기준)에 의존했는데, Reference는 **Workspace** 스코프라 그 Space에 속하지 않은 워크스페이스 멤버는 실제 인용이 조용히 빠져 보였다 — 삭제 확인 UI가 "인용 없음"으로 잘못 판정해 확인 없이 지워버릴 수 있는 안전 문제. 새 RPC는 SECURITY DEFINER로 Workspace 멤버십만 확인하고 Space 경계를 넘어 전부 반환한다.
- **`ReferenceSummary`에 `status` 추가 + `ReferenceRow`에 `canTrash = status === "active"` 게이팅**: 기존엔 `trash_reference`가 active만 대상으로 하는데도 목록이 상태를 안 돌려줘서 archived Reference에도 삭제 버튼이 떴다 — 지금은 `archive_reference` 호출부가 앱 어디에도 없어(grep 확인) 잠재적이었지만, Topic의 같은 패턴(`TopicRow`의 status 분기)을 그대로 적용해 지금 막음. `REFERENCE_STATUSES`/`ReferenceStatusSchema`도 신설(Tag/Topic과 같은 SSOT 패턴, 기존엔 Reference만 없었음).
- **`ReferenceRow`에 `trashReference.error` 인라인 렌더 + `skipGlobalToast` 추가**: `TopicRow`와 같은 이유·같은 수정.
- **마이그레이션 헤더 주석 정정**: CASCADE 근거로 든 테이블 목록과 마이그레이션 ID 목록의 순서가 안 맞아 위치 대응으로 잘못 읽힐 수 있었던 것, `reference_links`를 다른 두 테이블과 같은 컬럼명(`reference_id`)으로 뭉뚱그린 것(실제로는 `reference_a_id`/`reference_b_id`) 정정.
- **미반영, 문서화만 함**: `purge_expired_references`엔 source_purge의 `purge_job_last_success`류 워치독이 없다 — 이번 PR에서 의도적으로 유보한 결정(마이그레이션 주석·PR 노트에 명시). cron job이 조용히 죽어도 알림이 없다는 뜻이라, 필요해지면 워치독을 job명 인자화해 일반화하는 후속 작업 필요.

---

### 2026-07-14 — review 1차: Ingestion 리뷰 화면 3종 (Changes 탭 / Digest 리뷰 / Changeset 상세)

`review-flow.md`의 확정·버리기(기존)·되살리기·원본도 삭제하기 케이스 + Space 오버뷰 `changesets` 탭 스텁 실제 구현. BE(`digestReview.discard`/`.restore` + `discard_ingestion_review`/`restore_ingestion_review` RPC)는 같은 워크트리에서 다른 세션이 동시 진행 — 착지된 라우터·서비스를 다시 읽어 계약(입력 `{changesetId}`, 반환 없음) 그대로 훅을 짰다. `apps/web/src/features/review/` 신설(`dev-harness`는 `index.ts`에 `HarnessPage`만 공개해 훅을 직접 import할 방법이 없어 — 베이스라인 항목 참고 — 훅·컴포넌트 전부 새로 작성, 데이터 셰이프·invalidate 대상만 하니스 것을 참고).

- **discard/restore 뒤에는 `digestReview.get`을 invalidate하지 않는다**: `discard_ingestion_review`/`restore_ingestion_review` RPC 가드가 `status='pending'`(진행 중 리뷰)에만 걸려 있어, 버린 직후 그 changeset을 다시 GET하면 서버가 에러를 던진다. Digest 리뷰 화면은 mutation 성공 응답만으로 로컬 `outcome` 상태를 `applied`/`discarded`로 바꿔 화면을 유지한다(마지막으로 불러온 후보 목록은 읽기 전용으로 계속 보임) — 화면 이동 없음(review-flow.md "화면은 안 이동, 상태 표시만 버려짐으로 바뀜" 그대로).
- **되살리기·원본도 삭제하기는 Changeset 상세 화면에만 둔다**: review-flow.md의 두 케이스 Given이 둘 다 "changeset 상세를 보고 있다"로 시작해, `mvp-wireframe.html`(Digest 리뷰 화면에도 되살리기 버튼이 나타나는 데모)보다 이 문서를 우선했다. Digest 리뷰 화면이 버려진 뒤에는 "Changeset 상세 보기" 버튼 하나만 남고, 되살리기는 거기서만 가능.
- **Changeset 상세는 전용 조회 엔드포인트가 없어 `changeset.listChangesets` 캐시에서 id로 찾는다**: `changeset-router.ts`엔 단건 `get`이 없다(Changes 탭이 쓰는 목록 쿼리뿐). 최근 100건(`CHANGESET_LIST_LIMIT_MAX`) 밖의 오래된 changeset은 "찾을 수 없음"으로 처리 — 이번 슬라이스는 Changes 탭에서 방금 클릭해 들어오는 경로가 기본이라 감내. 목록·상세가 같은 쿼리 캐시를 공유해 한쪽에서 되돌리기/되살리기해도 다른 쪽이 자동으로 최신화된다.
- **"원본 삭제 후 되살리기 비활성화"는 `listChangesets`의 `sourceStatus`로 미리 판정**: PM 확인 후 BE가 같은 세션에서 `listChangesets`에 `sourceStatus`(원본 Source 상태)를 추가로 얹어줘서, 화면 진입 시점부터 `entry.sourceStatus !== "pending"`이면 되살리기·원본도 삭제하기 버튼을 바로 비활성화한다. "원본도 삭제하기" 성공 직후처럼 invalidate 반영이 아직 안 끝난 짧은 순간은 `trashSource.isSuccess`로 같이 커버(`sourceTrashed = trashSource.isSuccess || entry.sourceStatus !== "pending"`) — 서버 가드(`restore_ingestion_review`의 `NM008`)는 그대로 최종 방어선.
- **Changeset.number는 BE가 이번 세션에 추가, title은 다음 슬라이스로 남음**: `07-modeling.md`가 그리는 `Changeset.title`(LLM이 원문 전체로 생성, PR 제목처럼 편집 가능)·`number`(PR 번호처럼 전 타입 공유 시퀀스) 중 PM 확인 후 BE가 `number`만 이번 세션에 착지시켰다(`spaces.next_changeset_number` + INSERT 트리거로 원자적 채번, migration 헤더 주석에 title은 별도 백로그로 명시). Changes 탭 행·Digest 리뷰 헤더·Changeset 상세 헤더 전부 `#{number} · {효과 요약}`으로 갱신(`entry.number`/`review.changesetNumber`, null이면 `#` 표시 생략 — space 밖 `manual`만 해당). title은 아직 없어 효과 요약(`summarizeChangesetEffect`)이 계속 그 자리를 메운다 — title 컬럼이 착지하면 이 fallback 호출부만 교체하면 된다.
- **"제목 없이 확정 비활성화"는 Changeset 제목이 아니라 Digest 후보 제목**: review-flow.md 원문(Given: "Digest 후보의 제목을 입력한 상태다")을 다시 읽어 확인 — 위 Changeset.title 부재와는 무관한 별개 가드다. `DigestDraft.title`은 이미 스키마에 있는 필드라 `DigestCandidateCard`에 편집 가능한 `Input`을 얹고, 로컬에서 비운 채로 확정을 누르면 막힌다(서버도 `DigestDraftSchema`의 `min(1)`로 같은 규칙을 이미 강제하지만, 지우자마자 즉시 피드백이 필요해 클라이언트에서도 검사).
- **Digest/Reference 후보 삭제는 로컬 편집 상태에만 반영, "저장" 단계 없이 확정 시 한 번에 반영**: review-flow.md "Digest 후보 삭제"(컨펌 모달 없이 즉시 제거)를 따르되, 서버 `update` 호출은 확정 직전에만(편집 사항이 있을 때만) 한 번 보낸다 — dev-harness `DigestReviewCard`의 "저장 후 확정" 2단계 흐름 대신, 이번 화면은 "조회·확정·버리기"만 요구돼 저장 버튼을 따로 안 두고 확정에 흡수시켰다. 모든 후보(Digest+Reference)가 0개면 확정 비활성화(review-flow.md 그대로, Reference 후보도 카운트에 포함).
- **원문 대조는 side-by-side 하이라이트 대신 전체 원문 collapsible 패널**: `mvp-wireframe.html`의 "원문에서 보기" 링크는 `Digest.locator`(원문 내 위치)로 특정 후보를 하이라이트하는데, `digestReview.get`이 반환하는 `DigestDraft`엔 `locator`가 없다(리뷰 단계 draft엔 애초에 안 실림). 이번 슬라이스는 `SourceTextPanel`(기본 열림 `<details>`)로 전체 원문만 나란히 보여주는 축소판으로 대체 — 후보별 하이라이트가 필요해지면 BE가 draft에 locator를 실어야 한다.
- **"원본도 삭제하기"만 확인 다이얼로그(`DeleteSourceDialog`와 같은 weave `Dialog` 패턴), discard/restore/revert는 없음**: review-flow.md가 discard에 "컨펌 모달 없이" 즉시 반영을 명시한 것과 대칭으로, 되살리기·되돌리기도 같은 결의 즉시 반영 액션이라 모달을 안 뒀다. 원본 완전 삭제(`trash_source`)만 비가역성이 다른 급이라 기존 삭제 확인 패턴을 그대로 재사용.
- **status 배지는 `changeset_status`(`pending`/`applied`/`rejected`) 3값 그대로 노출, `outcome` 필드 흉내 안 냄**: BE가 discard/restore 마이그레이션 주석에 남긴 결정(`status`+`outcome` 2필드 모델은 07-modeling.md의 목표 스키마일 뿐 미구현, `rejected`를 "적용 안 하고 닫힘"에 재사용)을 FE도 그대로 따랐다 — `CHANGESET_STATUS_META`가 `rejected`→"버려짐" 배지로 매핑.
- **미반영, 다음 세션 참고**: Changeset.title 컬럼(위 항목, number는 이번에 착지), Digest.locator 노출(위 원문 대조 항목), Digest 후보의 설명·본문 필드 편집(이번엔 제목만 편집 가능, 나머지는 읽기 전용 조회), relation 타입 Open 행 클릭(review 2차 몫, 이번엔 목록에 보이기만 함).
- **검증**: `pnpm typecheck`/`lint`/`test`/`depcruise`/`knip`/`format:check`(모노레포 전체, server 402 케이스 BE의 `digest-review-service.test.ts` 5건 포함 + web 67 케이스) 전부 통과. 로컬 브라우저 E2E는 로그인 폼 렌더링·콘솔 에러 없음까지만 확인(인증 필요한 실제 데이터 화면은 자격증명이 없어 PM 진행 필요 — 위 세션들과 같은 사유로 이번에도 생략).

**amendment(2026-07-15, 멀티 에이전트 리뷰 반영)**: PR #412 리뷰에서 나온 FE 항목 반영. BE 스코프(Space 미스코프 리스트, discard RPC 주석-코드 불일치, 가드 테스트 부재)는 별도 트래킹 필요로 남겨둠.
- **`ChangesetStatusBadge`가 이제 `type`도 본다 — relation의 영구 거절과 ingestion의 되살릴 수 있는 버리기가 같은 "버려짐"으로 뜨던 걸 분리**: 위 항목("status 배지는 3값 그대로 노출")에서 놓친 부분 — `rejected` 값 자체는 relation·ingestion이 공유해도 되지만, 그 값이 화면에 뜨는 라벨까지 같을 이유는 없다. `relation`+`rejected`는 `review.status_rejected`("거절됨", 영구), 그 외(`ingestion` 포함)의 `rejected`는 기존 `review.status_discarded`("버려짐", 되살리기 가능)로 갈랐다(`changesetStatusMeta(status, type)`).
- **`useConfirmReview`/`useUpdateReview`에 `skipGlobalToast` 누락 발견·수정**: 형제 훅(`useDiscardReview`/`useRestoreReview`/`useTrashReviewSource`/`useRevertChangeset`)엔 이미 있는데 이 둘만 빠져 있었다 — Digest 리뷰 화면이 이미 인라인 에러를 보여주는데 전역 토스트까지 중복 노출되는 문제. PR #400/#410/#411에서 반복된 패턴과 같은 원인.
- **confirm/discard 성공 뒤 새로고침하면 뜨던 막다른 에러 화면에 "Changeset 상세 보기" 버튼 추가**: `getReview` 가드가 `pending`만 허용해 재조회가 항상 실패하는 건 의도된 동작이지만, 그 실패 화면이 그냥 에러 텍스트로 끝나 있었다 — 이미 정상 작동하는 Changeset 상세로 안내하는 버튼을 달았다.
- **`sourceTrashed` → 판정 로직·이름 재정비**: 실제로는 원본이 `active`(그 사이 다른 리뷰가 같은 원본을 재인제스천해 확정한 경우)여도 true가 되는데 이름이 "trashed"만 가리켜 오해 소지가 있었다. `restoreBlocked` + `blockReason`("trashed" | "reprocessed")으로 갈라, "원본이 삭제됨" 문구가 실제로는 안 지워지고 다른 리뷰로 처리된 경우까지 잘못 안내하던 것도 같이 고쳤다(`review.detail_source_reprocessed_disabled_reason` 신설).
- **`confirmDisabledReason`/확정 2단계 순서(편집저장→확정)를 `confirmReviewFlow.ts`로 추출해 순수 함수·테스트로 고정**: 둘 다 컴포넌트 안에 있을 땐 렌더링 없이 못 검증했다 — `isSpaceNameTaken.test.ts`와 같은 결의 순수 함수 테스트 7건 추가(`confirmReviewFlow.test.ts`). `runConfirmReview`는 `updateReview`가 reject하면 `confirmReview`를 아예 안 부르는 것까지 테스트로 고정해, "저장 실패했는데 확정은 성공"류 회귀를 리팩터링 중에 잡아낼 수 있게 했다.
- **BE로 넘긴 항목 중 3건은 같은 라운드에 BE가 착지, FE는 그 위에 배선만**: (1) `listChangesets`가 spaceId 스코프 없이 유저의 모든 Space를 섞어 반환하던 문제(Critical — `changesets.number`가 Space 안에서만 유일해 서로 다른 Space의 changeset이 같은 "#12"로 보일 수 있었음) — BE가 `ListChangesetsInputSchema.spaceId`(옵셔널, 미지정 시 가장 오래된 멤버십으로 폴백 — MCP·dev-harness 전용 경로)를 추가하고 서비스가 `.eq("space_id", ...)`로 필터. FE는 `useChangesetListQuery(spaceId)`로 시그니처를 바꾸고, `ChangesPanel`엔 `SpaceOverview`가 이미 들고 있는 `space.id`를, `ChangesetDetailScreen`엔 `useSpaceList()`로 `spacePublicId`를 직접 풀어 넘긴다 — 부수효과로 "잘못된 Space URL로 다른 Space의 changeset에 접근"도 같이 막힌다(`entry`를 그 Space로 스코프된 목록에서만 찾으므로 없으면 자동으로 not-found). `entry.number`도 이제 스코프가 항상 있어 `number | null`이 아닌 `number`로 좁아져 null 체크를 걷어냈다. (2) `discard_ingestion_review` SQL 주석-코드 불일치(comment-analyzer 발견)는 BE가 실제 `IF NOT FOUND` 가드를 추가해 해소. (3) `discardReview`/`restoreReview` 가드 실패 테스트 부재는 BE가 에러 코드 검증 테스트로 보강. (4) "Raw SQL 예외가 유저 배너에 노출된다"는 지적은 `error-mapper.ts`의 `mapDomainError`가 매핑 안 되는 에러까지 전부 `error.default`로 덮는 걸 확인해 이번엔 재현 못 함 — 근거 있으면 재검토.
- **검증**: `pnpm typecheck`/`lint`/`test`/`depcruise`/`knip`/`format:check`(모노레포 전체, server 404케이스 — BE의 가드 실패 테스트 2건 포함 + web 74케이스 — `confirmReviewFlow.test.ts` 7건 추가) 전부 통과. `workspace`↔`review` 피처 배럴이 서로를 import하게 된 것도 depcruise `no-circular` 규칙과 `vite build --mode staging`(프로덕션 번들) 둘 다로 순환 의존성 문제 없음을 확인.

---

### 2026-07-15 — Changeset 제목에 Source 제목 노출 (PR #412 팔로우업)

PR #412가 "Changeset.title 컬럼이 없어 효과 요약으로 대체, 컬럼 착지하면 교체"로 남겨둔 걸 처리 — `Changeset.title`(엔진이 원문 전체로 생성하는 별도 필드) 자체는 여전히 미착지지만, `sources.title`은 이미 intake 3차 슬라이스(PR #400)에서 착지해 있었고 ingestion changeset은 정확히 하나의 Source에 매인다는 사실을 그대로 활용 — 새 컬럼·마이그레이션 없이 기존 `sources` 조인에 `title` 한 필드만 추가하는 순수 조회 확장.

- **`listChangesets`(Changes 탭·Changeset 상세)와 `digestReview.get`(Digest 리뷰) 둘 다에 `sourceTitle` 추가**: 전자는 이미 `sources(status)`를 조인 중이라 `sources(status, title)`로, 후자는 `sources(body, created_at)`를 `sources(title, body, created_at)`로 확장. 브리핑엔 `listChangesets`만 명시돼 있었지만 "헤더에 제목 노출하는 곳"에 Digest 리뷰 화면도 포함돼 있어(브리핑 3번), `digestReview.get`도 같이 확장했다 — 안 하면 그 화면만 여전히 정적 라벨("Digest 리뷰")만 보임.
- **표시 형식은 항상 `#번호 · 제목`, 제목 자리만 sourceTitle 우선·효과 요약 폴백**: `changesetDisplayTitle(entry, t) = entry.sourceTitle ?? summarizeChangesetEffect(entry.effect, t)`를 `utils.ts`에 신설해 `ChangesetListRow`·`ChangesetDetailScreen` 둘 다 공유(중복 방지). `summarizeChangesetEffect`는 이제 그 안에서만 불려 `export`를 뗐다(knip이 죽은 export로 잡음). Digest 리뷰 화면은 `effect`가 애초에 없어(그 API가 안 돌려줌) 폴백이 정적 라벨 그대로 — `review.sourceTitle ?? t("review.digest_review_title")`로 별도 처리.
- **non-ingestion(relation·revert)·아직 추출 중인 ingestion은 여전히 효과 요약**: `sourceTitle`은 `source_id`가 있는 행에서 Source가 실제 제목을 가졌을 때만 채워진다 — relation/revert는 source_id가 없어 항상 null, ingestion이라도 digestion 완료 전(사실상 없음, ingestion changeset 자체가 완료 후에만 생김)엔 null일 수 있어 두 경우 다 기존 폴백이 그대로 맞다.
- **서버 테스트는 이미 있던 `getReview` 케이스에 `sourceTitle` 필드·assertion만 추가**: `changesetNumber`를 검증하던 자리 바로 옆에 `expect(review.sourceTitle).toBe(...)`. `listChangesets`는 원래 단위 테스트가 없어(순수 Supabase 조회, `buildRevertedPredicate`만 분리 테스트됨) 새로 만들지 않음 — 이번 변경은 select 문자열에 필드 하나 추가하는 수준이라 기존 스코프 밖의 테스트 하네스를 새로 짜는 건 이 팔로우업엔 과함.
- **검증**: `pnpm typecheck`/`lint`/`test`/`depcruise`/`knip`/`format:check`(모노레포 전체, server 404케이스 — `getReview` 테스트에 assertion 1건 추가 + web 74케이스) 전부 통과.

---

### 2026-07-15 — review 1차: Digest 후보 카드 Topic·Tag 칩 UI

`review-flow.md`의 "기존 Topic·Tag는 이름 수정 불가"/"신규 Topic·Tag 이름 수정 가능"/"Topic·Tag 추가 — 기존 선택"/"— 신규 생성" 4개 케이스. BE(같은 워크트리, 다른 세션 동시 진행)가 `DigestTopicDraft`/`DigestTagDraft`(`{id: string|null, name|title, ...}` — id 있으면 기존/읽기전용, null이면 신규/편집 가능, `getReview`가 Space·Workspace 레지스트리 이름 매칭으로 판정)를 착지시킨 뒤 그 스키마를 그대로 읽어 배선했다. `DigestCandidateCard`(PR #412 산출물)에 칩 UI를 얹고, `features/dev-harness/DigestReviewCard.tsx`의 콤마 구분 텍스트 입력을 대체하는 것이 이번 슬라이스의 실제 제품 화면.

- **weave에 `Popover` 프리미티브 신설**: 검색 인풋+필터링 리스트 조합("타이핑 가능한 팝오버")엔 `DropdownMenu`가 안 맞는다 — Radix DropdownMenu는 typeahead·roving focus가 내부 인풋과 충돌한다(생태계에 알려진 제약). `Dialog`/`DropdownMenu.tsx`와 같은 결(`radix-ui` Popover 래핑, `useEscapeAwareCloseFocus` 재사용, `cn` 토큰)로 `Popover.tsx`를 새로 만들어 `index.ts`에 추가했다 — 범용 프리미티브 레이어 갭이라 weave가 맞는 자리(baseline 감사 문서의 "복합 패턴 없음" 항목 중 하나가 채워진 셈).
- **`TopicAddPopover`/`TagAddPopover`**: `topic.list`/`tag.list`를 팝오버가 열렸을 때만 조회(`enabled`)해 검색어로 필터링, 기존 항목 클릭 시 즉시 추가, 검색어와 완전 일치하는 기존 항목이 없을 때만 "새로 만들기" 옵션 노출. 이미 이 Digest에 붙은 항목은 `excludedTopicIds`/`excludedTagIds`로 후보에서 제외(중복 추가 방지). `DIGEST_TOPICS_MAX`/`DIGEST_TAGS_MAX`(각 5개)에 도달하면 트리거 자체를 비활성화 — 서버 zod `.max()`가 어차피 막지만, 실패 후 안내보다 애초에 못 누르게 하는 쪽이 "제목 없이 확정 비활성화"(위 항목)와 같은 결의 조기 피드백이다.
- **신규 Tag 생성만 이름+description 미니 폼 — PM 확인 후 결정**: review-flow.md "신규 생성" 케이스는 Topic·Tag를 "검색어를 이름으로 새 라벨이 즉시 추가된다"고 동일하게 서술하지만, Tag는 데이터 모델상 `description`이 필수(`TagDraftSchema.description` min(1), 07-modeling Tag 예외 조항)라 이름만으로는 저장이 안 된다 — spec이 놓친 지점이라 PM에게 확인했고, "새로 만들기" 선택 시 Topic은 그대로 즉시 추가되지만 Tag만 이름(검색어 프리필)+description 2필드 미니 폼으로 전환하기로 확정했다. weave에 Textarea 프리미티브가 없어(baseline에 없음, 아직 2곳 이상 필요성이 없음) description 입력은 이 컴포넌트 안에 로컬 `<textarea>`로 Input과 같은 톤의 클래스를 직접 얹었다 — 승격 기준(2개 이상 feature에서 재사용) 미달이라 weave로 안 올림.
- **`EditableLabelChip`**: 기존(readOnly, id 있음 — 플레인 텍스트+제거 버튼)/신규(id 없음 — 인라인 `<input>`으로 이름 수정 가능+제거 버튼) 두 모드를 하나의 프레젠테이션 컴포넌트로 처리. 인라인 인풋은 JS 폭 측정 없이 네이티브 `size` 속성(글자 수 기반)으로 자동 폭 조절 — 칩이라는 작은 컨텍스트에 별도 리사이즈 로직을 얹을 정도는 아니라고 판단. Topic은 `Badge variant="brand"`(기존 카드가 이미 쓰던 색), Tag는 `variant="neutral"`, 기존 인용 Reference는 `variant="info"`로 세 그룹을 라벨 텍스트 없이 색만으로 구분(review-flow.md가 이미 Digest 후보 카드 안에서 "인용 Reference"까지 함께 보여주고 있어, 세 번째 색까지 필요했다).
- **Tag는 description을 칩에서 노출하지 않는다**: 와이어프레임(`#screen-digest-review .tag-chip`, `panel-digest-detail`의 `.badge`)도 Tag 칩엔 title만 보여주고 description은 어디에도 안 띄운다 — Digest 상세·리뷰 어느 화면도 칩에서 정의를 안 보여주는 기존 패턴을 그대로 따랐다. description은 신규 생성 시 한 번 입력받아 저장 페이로드에만 실린다.
- **`DigestReviewScreen`에 `topicsOverrides`/`tagsOverrides` 추가 — 기존 `titleOverrides`와 같은 패턴**: `Map<index, DigestTopicDraft[]|DigestTagDraft[]>`로 편집 상태를 들고, `digestRows` 계산 시 override 우선·없으면 원본 draft로 병합(title과 동일 결). `dirty` 판정에도 두 Map의 size를 추가해, topics/tags만 바꾸고 title은 안 바꿔도 확정 시 저장이 걸리게 했다. `confirmReviewFlow.ts`의 `digestRows`/`updateReview` 페이로드 타입에 `topics`/`tags`를 추가하고 `runConfirmReview`가 스프레드하도록 확장 — `confirmReviewFlow.test.ts`의 기존 3케이스는 topics/tags를 빈 배열로 채워 넣는 선에서 그대로 유지(로직 자체는 안 바뀜, dirty 우선순위·update-then-confirm 순서 검증은 그대로 유효).
- **Digest 타입 배지는 이번 슬라이스 대상 아님**: 브리핑이 "Digest 타입 표시도 후보 카드에 반영"이라고 했지만 확인해보니 PR #412가 이미 `DIGEST_TYPE_LABEL` Badge로 구현해뒀다 — 추가 작업 없음.
- **검증**: `pnpm typecheck`/`lint`/`test`/`depcruise`/`knip`/`format:check`(모노레포 전체, server 406케이스 + web 74케이스, 둘 다 이번 변경으로 늘거나 준 케이스 없음 — 순수 FE 슬라이스) 전부 통과. **브라우저 라이트/다크 확인은 PM이 직접 진행**(이번 세션은 로컬 dev 서버만 띄워두고 자동화 브라우저 조작은 PM 요청으로 하지 않음) — 위 세션들의 "자격증명 없어 생략"과 달리 이번엔 세션에 로그인된 브라우저가 있었지만, 검증 주체를 PM으로 넘긴 것.

**amendment(2026-07-15, 멀티 에이전트 리뷰 반영)**:

- **Critical — 신규 Topic·Tag 이름을 빈 값으로 지워도 확정 버튼이 안 막혀 원문 zod 에러(영문 JSON)가 그대로 노출**: `hasEmptyTitle`(Digest 제목)만 검사하던 확정 비활성화 조건에 `hasEmptyLabel`(신규 라벨 이름 공백 여부)을 추가해 사전 차단. 더불어 `trpc.ts`의 `errorFormatter`에 `isZodInputError` 판정을 신설해, 이 케이스가 아니더라도 tRPC 입력 파서가 던지는 `ZodError`가 도메인 에러 매핑망을 안 타고 원문 issue 배열로 새는 경로 자체를 전역적으로 막았다(이번 기능에 국한되지 않는 방어).
- **Critical — `confirmReviewFlow.test.ts`의 "dirty" 테스트가 topics/tags 배선을 실질적으로 검증 못 하던 가짜 통과**: 공유 `DIGEST` fixture가 `topics: []`/`tags: []`라 override 로직이 깨져도 assertion이 그대로 통과했다 — override 값이 원본과 다른 별도 fixture로 교체해 실제 회귀 감지력을 갖게 했다.
- **Important — `TopicAddPopover`가 다른 Space의 동명 Topic을 "기존"으로 노출하던 크로스-Space 버그(`listChangesets`와 같은 패턴)**: `topic.list`에 옵셔널 `spaceId`를 추가(미지정 시 기존 동작 그대로 전 Space, Topic 관리 화면이 계속 씀)해 Digest 리뷰만 현재 Space로 좁힘 + `archived` 제외 필터에 `statement-search.test.ts`와 같은 결의 `eq()` 호출 회귀 단언 추가.
- **Important — 팝오버 로딩/에러 상태가 "결과 없음"과 구분 안 되던 문제**: `isLoading`/`isError`를 읽어 별도 문구로 분리, 검색/정확매치 로직은 `labelSearch.ts`로 추출해 순수 함수 테스트로 고정.
- **Suggestions 3건 반영**: 같은 Digest 안 신규 라벨 이름 중복 생성 방지(`isDuplicateLabelName`), `EditableLabelChip`의 `readOnly`/`onNameChange` 페어링을 discriminated union으로 강제(편집 가능한데 핸들러 없는 상태를 타입으로 원천 차단), `DigestTagDraft.id`(쓰기 시 무시되는 표시용 힌트)와 `TagUpdateInputSchema.id`(신뢰되는 PK) 의미 차이를 스키마 주석으로 문서화.
- **검증**: 위 수정 전부 리뷰에서 실제 diff를 대조해 정확성 확인(4개 에이전트 병렬 리뷰 — code-reviewer/silent-failure-hunter/type-design-analyzer/pr-test-analyzer). CI(`check`) 통과, `mergeStateStatus: CLEAN`.

---

### 2026-07-15 — Source 원본 편집 + 제목 생성을 디제스천에서 분리 (PR #415)

"결과없음(empty)"에서 재추출을 눌러봐야 원본이 그대로면 같은 결과가 나올 뿐이다 — 재추출이 의미를 가지려면 그 전에 원본(body)을 고칠 수 있어야 한다. 이 김에 제목 생성 방식도 다시 봤다: 제목은 Digest 추출 결과에 의존하지 않는데도 추출과 같은 무거운 LLM 콜(원문 전체 분석, standard 티어)에 얹혀 나오고 있었다.

- **제목 생성을 디제스천에서 완전히 분리**: body만 보는 별도 nano 콜로 떼어내 Source 생성 시점에 한 번 띄운다(ChatGPT 사이드바 제목이 응답 완료를 안 기다리고 첫 메시지만 보고 뽑히는 것과 같은 패턴). 응답을 안 붙잡는다(`fillSourceTitle`, fire-and-forget) — 제목 콜이 죽어도 원본 저장은 이미 끝난 일이고, 제목 없는 원본은 화면이 body 미리보기로 그린다. 재시도·큐도 없다 — 제목은 평생 한 번만 시도하는 값이다(`trackEvent`와 같은 부수효과 호출 규약). nano엔 body 전체(최대 100k자) 대신 앞 4,000자만 넣는다 — 도입부만 봐도 제목은 나오고, 장문 하나가 콜 비용·지연을 튀게 하는 손해가 크다.
- **`title_edited` 플래그 제거, `title IS NULL` 구조 가드로 대체**: 이 플래그는 "누가 title을 채웠나(사람/LLM)"를 구분했지만, 제목 생성이 생성 시점 한 번뿐인 지금은 "이미 채워진 적 있나"만 보면 충분하다. 새 RPC `fill_source_title`은 `title IS NULL`이 유일한 가드라 한 번 채워진 제목을 구조적으로 못 덮는다 — 사람이 먼저 고쳤든 앞선 콜이 채웠든 두 번째 쓰기는 조용히 no-op(사람 편집과 달리 예외를 안 던진다). `complete_source_digestion`·`create_ingestion_review`는 이제 `p_title` 파라미터가 없고 title과 완전히 무관해졌다.
- **`update_source_body` 신설 — 원본 편집 가드**: `update_source_title`과 같은 가드(pending + 처리 중 아님)에 "열린 pending 리뷰 없음"을 하나 더 얹는다. 리뷰에 뜬 Digest 후보들이 바로 그 body에서 뽑힌 것이라, 원본을 갈아치우면 더는 존재하지 않는 문장에서 나온 후보가 된다. 실제로 열리는 자리는 cancelled·failed·empty·discarded(리뷰를 사람이 버린 뒤) 넷 — 전부 "지금 화면에 걸린 후보가 없는" 자리다. body를 고쳐도 title은 그대로 둔다(비우면 사람이 정한 제목이 다음 생성 콜에 덮이는, 방금 없앤 문제가 되돌아온다 — 애초에 재추출도 title을 안 건드리므로 이 우려 자체가 구조적으로 사라졌다).
- **BE만 착지, FE는 후속**: `source.updateBody` tRPC 뮤테이션까지는 이번 슬라이스에 포함되지만 편집 액션 UI(버튼·다이얼로그)는 없다 — `intake-flow.md`의 "초안에서 Source 원본 편집" 케이스는 미체크로 남김.
- **배포 순서 주의**: `complete_source_digestion`·`create_ingestion_review`의 시그니처가 바뀐다(`p_title` 제거) — 마이그레이션이 먼저 반영되고 새 서버 코드가 아직 안 뜬 창에서는 구 워커가 없는 시그니처를 호출해 디제스천이 실패한다(워커 재시도가 흡수). PR #413의 `20260713110000` 선례와 같은 패턴.

**amendment(2026-07-15, 멀티 에이전트 리뷰 반영)**:

- **Important — `fillSourceTitle`의 "공백뿐인 제목" 분기가 완전히 무음이었음**: LLM 프로바이더의 빈 응답 가드는 완전히 빈 문자열만 막아, 공백만 있는 응답은 trim 후 서비스까지 와서 조용히 return됐다 — 같은 함수의 다른 두 실패 경로(RPC 에러, LLM 예외)는 전부 Sentry로 가는데 이 경로만 무음이라, 프로바이더가 통째로 망가져도 아무도 몰랐을 것. `Sentry.captureMessage` 추가 + 테스트로 고정.
- **Important — `fillSourceTitle`의 RPC 에러 분기가 미검증**: `fill_source_title` RPC 자체가 에러를 반환하는 경로(마이그레이션 주석이 명시한 실제 시나리오 — 사람이 async 콜 도착 전에 직접 제목을 편집)에 대한 테스트가 없었다 — `titleSupabase()` 목을 확장해 `fill_source_title`에 에러를 주입할 수 있게 하고 테스트 추가.
- **주석 정정 2건**: (1) `update_source_body`가 열리는 자리를 "cancelled·failed·empty 셋"이라고 했지만 실제론 리뷰를 사람이 버린(discarded) 경우까지 넷이다 — discarded는 changeset이 pending에서 빠져 가드를 통과하는데, "판단이 안 나와서"가 아니라 "판단은 나왔지만 사람이 버려서"라 원래 주석의 근거 자체가 그 케이스엔 안 맞았다. (2) `fill_source_title`의 무음 no-op가 사실 둘로 갈린다는 것(title 이미 채워짐 — 정상 / 호출자가 Space 멤버 아님 — 비정상이지만 현재 호출부 구조상 도달 불가)을 주석에 추가.
- **Suggestion — `task-routing.ts`의 stale 카운트 주석**: "9개 LLM 기능"이 이 PR로 10개가 되며 stale해진 걸 발견해 카운트 표기를 뗌.
- **검증**: 위 수정 전부 리뷰에서 실제 diff를 대조해 정확성 확인(4개 에이전트 병렬 리뷰 — code-reviewer/silent-failure-hunter/pr-test-analyzer/comment-analyzer). `pnpm typecheck`/`lint`/`format:check`/`knip`/`depcruise`/`test` 전부 통과, CI(`check`) 통과, `mergeStateStatus: CLEAN`.

---

### 2026-07-15 — review 1차: Digest 후보 카드 Reference 편집(신규·병합) + Digest 타입 변경 초기화

`review-flow.md`의 "신규 Reference 후보 편집"/"기존 Reference 후보 병합 편집"/"타입 변경 시 필드 초기화" 3개 케이스. Topic·Tag 칩 슬라이스(위 항목)와 같은 override-Map 패턴을 Reference·body·병합노트로 확장한 것 — 새 프리미티브 없이 `DigestReviewScreen`의 편집 상태만 늘렸다. BE(기존 Reference 병합 계약: `citedReferences[].mergeNote` 노출 + `referenceUpdates` 저장)는 같은 워크트리 다른 세션이 동시 진행 — 착지된 스키마·마이그레이션을 다시 읽어 계약 그대로 배선했다.

- **신규 Reference 후보를 편집 가능하게(`ReferenceCandidateCard`)**: 지금까지 이 카드는 표시+삭제 전용이었는데(PR #412), 스펙의 "타입·이름·설명 수정"을 위해 타입은 weave `Select`(reference 5유형, `REFERENCE_TYPE_LABEL`), 이름은 `Input`, 설명(body)은 로컬 `<textarea>`(Topic·Tag 미니 폼과 같은 클래스 톤 — weave에 Textarea 없음, 승격 기준 미달)로 인라인 편집. `DigestReviewScreen`에 `referenceOverrides: Map<key, ReviewNewReference>` 추가(기존 `titleOverrides`류와 동형, key로 원본 draft를 덮음). 쓰기 계약은 이미 완비돼 있었다 — `NewReferenceDraft{key,type,title,body,externalUrls}`가 `updateReview` 페이로드에 원래부터 전부 실려, BE 스키마 변경 없이 편집분만 `confirmReviewFlow`가 흘려보내면 됐다(신규는 확정 전까지 서버에 행이 없어 편집이 곧 이 changeset 초안 갱신).
- **신규 Reference 이름·설명, 병합 설명 공백은 확정 사전 차단**: `NewReferenceDraftSchema`(title·body)·`ReferenceMergeUpdateSchema`(mergeNote) 모두 `min(1)`이라 비우면 확정 시 zod 원문(영문) 에러가 샌다 — Topic·Tag 이름 공백을 `hasEmptyLabel`로 막던 것과 같은 결로 `hasEmptyReference`(신규 필드 공백 ∪ 병합 설명 공백)를 추가하고, `confirmDisabledReason`을 4번째 인자로 확장(우선순위: 후보없음 > 제목 > 라벨 > 레퍼런스). `confirmReviewFlow`가 신규 Reference의 title·body와 병합 mergeNote도 저장 전 `trim()`(제목·라벨과 동일).
- **Digest 타입은 배지에서 `Select`로 교체**: PR #412가 `DIGEST_TYPE_LABEL` 읽기전용 배지로 뒀던 자리를 5유형 드롭다운으로 바꿨다. 타입을 바꾸면 `onBodyChange({ type })` — 판별자만 있고 필드가 빈 새 body로 통째 교체해 이전 타입 전용 필드를 즉시 버린다(컨펌 모달 없음, 스펙 "타입 변경 시 필드 초기화" 그대로). `bodyOverrides: Map<index, body>` 추가. 이 역시 쓰기 계약 무변경 — `DigestDraft.body`가 discriminated union이라 다른 타입 body를 그대로 받는다(BE는 task로 "감당하는지 확인"만 요청됐고 실제 스키마 손댈 것 없었음).
  - **주의 — body 필드 자체의 인라인 편집은 이 슬라이스 밖**: 카드는 body를 여전히 읽기전용 `dl`로 그린다(`bodyFieldValues`). 타입 변경 → 빈 body → `dl`이 사라지는 게 "초기화"의 가시적 결과다. 초기화 후 새 타입 필드를 다시 채우는 경로(@ 멘션·본문 편집)는 review-flow.md의 별도 미체크 케이스라 여기서 안 건드렸다 — 타입 변경은 "엔진이 유형을 잘못 분류했을 때 사람이 교정"하는 동작이고, 교정 후 필드가 비는 건 의도된 상태(그 유형 필드가 애초에 안 맞음)라 감내.
- **기존 Reference 병합 편집(`ReferenceMergeCard` 신설)**: BE가 착지시킨 계약 그대로 — `getReview`가 인용마다 `mergeNote: string | null`(엔진 병합 제안, 없으면 null)을 얹고, `updateReview`가 `referenceUpdates: [{referenceId, mergeNote}]`를 받아 `modify` change로 저장한다. 카드는 와이어프레임(`#screen-digest-review`)대로 **타입·이름 읽기전용(재분류는 이 리뷰 밖의 무거운 조작) + "바뀔 설명"(mergeNote) textarea만 편집**. 신규 후보와 같은 "Reference (N)" 섹션에 나란히 두고 카운트도 합산(와이어프레임의 단일 목록 구조). `mergeNoteOverrides: Map<referenceId, string>` 추가.
  - **편집 여부와 무관하게 살아있는 병합 제안을 전부 실어 보낸다**: `update_pending_ingestion`이 `DELETE FROM changes` 후 페이로드로 전체 재작성하는 구조라(마이그레이션 확인), 편집한 것만 `referenceUpdates`에 담으면 손 안 댄 엔진 제안의 modify change가 유실된다. 그래서 `referenceUpdates`는 현재 뷰의 모든 병합 후보(override 우선, 없으면 원본 mergeNote)를 담는다 — RPC가 `before = after`면 빈 modify를 안 만드니(line 77) unchanged 재전송은 무해.
  - **병합 후보는 살아있는 인용으로 좁힌다**: 그 Reference를 인용하던 Digest를 전부 삭제하면 병합 편집 카드도 사라지고 `referenceUpdates`에서도 빠진다(`citedIdsInView`로 필터) — Digest 카드 안 인용 배지가 살아있는 Digest 기준으로만 보이는 것과 같은 결. 확정 후에도 아무 Digest가 안 가리키는 Reference의 body가 조용히 병합되는 일을 막는다.
  - **원본 대비 diff("기존 설명")는 생략**: 와이어프레임은 삭제=취소선/추가=밑줄 diff를 제안하지만, `getReview`의 `citedReferences`가 현재 body를 안 내려줘(id·type·title·mergeNote뿐) diff 렌더에 필요한 원본이 없다. 병합 결과("바뀔 설명")만 편집 필드로 보여주는 것으로 축소 — diff 표시는 후속(BE가 현재 body를 함께 내려주면).
  - **인용 배지는 그대로 둔다**: 병합 제안이 붙은 Reference는 이제 병합 섹션 카드(설명 편집)와 Digest 카드 안 `variant="info"` 배지(인용 맥락) 양쪽에 나타난다 — 배지는 "이 Digest가 X를 인용", 카드는 "X의 설명을 이렇게 바꾼다"로 뜻이 달라 중복이 아니다.
- **검증**: `pnpm typecheck`/`lint`/`format:check`/`knip`/`depcruise`/`test`(모노레포 전체 — web 89케이스·`confirmReviewFlow` 6→13으로 확장[body override 흐름·신규 Reference trim·병합 제안 전량 전송+trim을 원본과 다른 fixture로 회귀 감지], server 419케이스) 전부 통과. **브라우저 라이트/다크 확인은 PM이 직접 진행**(pending ingestion 리뷰 시드 데이터가 필요해 자동화는 위 Topic·Tag 슬라이스와 같이 PM에게 넘김).

**amendment(2026-07-15, PR #416 멀티 에이전트 리뷰 반영)**:

- **원본 body를 화면에 노출 + "원래대로"로 병합 거부(위 "diff 생략" 판단 갱신)**: 리뷰가 "제안을 거부할 방법도, 원본을 볼 방법도 없다"고 지적했고, BE가 `getReview`의 `citedReferences`에 `body`(현재 설명)를 실어주면서 전제가 바뀌었다. `ReferenceMergeCard`가 "기존 설명"(읽기전용)+"바뀔 설명"(편집)을 나란히 보여주고, "원래대로" 버튼은 mergeNote를 원본 body로 되돌린다 — RPC가 `before===after`면 modify를 안 만드는(no-op) 성질을 이용해 별도 삭제 상태 없이 "거부"를 표현한다(더 가역적이고 목록에 남아 재편집 가능). 앞선 항목의 "diff 생략"은 여전히 유효하지만(취소선/밑줄 하이라이트는 후속), 원본 자체는 이제 보인다.
- **자유 텍스트 길이 상한 사전 차단(PR #414의 빈값 버그가 길이 차원에서 재발)**: `hasEmptyReference`는 빈값만 막았고 상한이 없어 초과 입력 시 zod 원문 에러가 샜다 — 신규 Reference 제목·설명·병합 mergeNote·Digest 제목 입력에 `maxLength`(repo 표준 패턴: SpaceNameField·RenameInput 등)를 얹어 애초에 초과 입력이 안 되게 했다.
- **병합 후보 계산을 순수 함수로 추출(불변식이 UI 배선에만 의존하던 문제)**: "살아있는 인용만·mergeNote 있는 것만"(`buildMergeRows`)과 "전량 재전송"(`toReferenceUpdates`)을 `referenceMerge.ts`로 빼고 테스트를 붙였다(null/non-null 혼합, 인용 사라진 후보 pruning, override, "원래대로"). `DigestReviewScreen` 인라인 로직에만 있어 회귀 감지가 안 되던 걸 고정.
- **`as` 단언 3건을 타입 가드로(convention 게이트)**: Reference·Digest 타입 Select·서버 문자열의 `type as …`를 `isDigestType`/`isReferenceType`(SSOT 배열 기반 가드)로 대체 — `apps/web/docs/conventions.md` "가드 없는 as 금지".
- **BE 동반 착지(같은 워크트리)**: 사용자 경로(update·confirm)에서 병합 대상이 그 사이 archive/trash되면 조용히 스킵 대신 `NM008`을 던져 새로고침을 유도한다(워커 경로는 관대히 스킵 — 정책 분기 근거를 마이그레이션 주석에 문서화). FE는 이미 mutation 에러를 헤더에 인라인 표면화하므로 "유실됐는데 성공으로 보임"이 해소된다.
- **검증**: 위 전부 반영 후 `typecheck`/`lint`/`format:check`/`knip`/`depcruise`/`test`(web 94케이스[`referenceMerge` 5케이스 신설], server 419케이스) 통과.

---

### 2026-07-15 — 디자인 폴리싱: 초안 카드/상세 상태별 재설계 + 전역 UI 정비 (PR #409)

`/drafts` 화면(초안 목록 + 사이드 상세) 폴리싱. 화면 국한 결정과 전역 영향 결정이 섞여 있어 나눠 기록한다.

**전역 영향 (Drafts 밖에도 적용됨)**

- **포커스링 전역 inset 처리**: `*:focus-visible`의 `outline-offset`을 양수(바깥으로 삐져나옴)에서 `-2px`(안쪽)로 바꿨다. 근거: 촘촘한 리스트(LNB 등)에서 형제 요소가 삐져나온 링을 덮어버리는 문제가 반복돼 그때마다 `relative`+`focus-visible:z-10`을 개별 컴포넌트에 붙여왔는데, 링이 박스 밖으로 못 나가면 애초에 덮일 자리가 없어져 이 패치들이 구조적으로 불필요해진다. 기존 패치는 제거했으나, `relative`가 포커스링이 아니라 다른 절대위치 자식(예: `NavItem`의 배지)의 기준점으로도 쓰이는 곳은 `relative`만 남기고 `focus-visible:z-10`만 뺐다.
- **툴팁 — 아이콘 전용 액션 버튼에만, 전역 딜레이 300ms**: 텍스트 라벨이 있는 버튼엔 안 붙인다(설명 대상이 이미 버튼에 있어서). LNB 접힘 상태에서는 `side="right"`. 페이드 애니메이션은 추가했다가 뺐다 — 불필요한 모션으로 판단.
- **SidePanel 승격 + 폭 전역 상수화**: `features/session/`(1st consumer: ChatPanel) 전용이던 걸 `components/ui/`로 승격(2nd consumer: DraftsScreen). 기본 폭(600px)은 `defaultWidth` prop이 아니라 모듈 상수로 뒀다 — "폭은 항상 통일될 것"이라는 판단(prop화하면 화면마다 값이 갈릴 여지를 만듦). Esc 닫기는 raw `document.addEventListener` 대신 기존 단축키 레지스트리(`useRegisterAction`/`actionMap.ts`)를 통해 등록 — 새 이벤트 경로를 만들지 않기 위함.
- **RelativeTime — "ago"/"전" 접미사 완전 제거**: date-fns 기본 로케일 문구("about 3 hours ago"/"약 3시간 전")가 11px 캡션엔 장황하다고 판단해 커스텀 압축 포맷("3h"/"3시간")으로 교체, 이후 접미사까지 국문·영문 동일하게 뺐다(하나만 빼면 언어 간 표현 규칙이 갈라짐).

**초안(Drafts) 화면 전용**

- **카드/상세 패널을 상태별 컴포넌트로 분리** (`WorkingDraftCard`/`IdleDraftCard`, `WorkingDraftDetailPanel`/`IdleDraftDetailPanel` + 공유 `DraftCardShell`/`DraftDetailHeader`): 기존 `DraftCard`/`DraftDetailPanel` 안에서 상태별 분기가 계속 누적되던 구조를 상태 하나당 컴포넌트 하나로 바꿨다. Shell은 클릭/키보드 핸들링만, Header는 Space pill+닫기+상태별 `extraAction` 슬롯만 공유.
- **사이드뷰 = 상세페이지로 취급**: `NavigationBar`를 목록 컬럼에만 스코프하고, SidePanel은 헤더 행을 포함한 전체 높이로 목록 컬럼과 나란한 형제로 배치(이전처럼 NavigationBar 아래 중첩 아님).
- **사이드뷰 상태 URL/스토리지 미유지**: 선택된 draft는 순수 로컬 `useState`. 근거: URL이나 스토리지로 남길 만큼 중요한 영역이 아니라고 판단(리뷰/브라우징 화면과는 다른 무게감).
- **"Regenerate" 용어 채택, 기존 "Extract" 재사용 안 함**: 편집 후 재생성은 최초 추출과 성격이 달라 같은 단어를 쓰면 혼동 소지가 있다고 판단. Granola(편집 후 재처리를 "Regenerate"로 표기), ChatGPT/Claude의 재생성 관용구를 근거로 확인 후 채택.
- **Regenerate 버튼 — 패널 하단좌측 고정**: 헤더 우측(닫기 옆)은 무게감이 안 맞아 기각(닫기는 chrome급 ghost 액션, Regenerate는 콘텐츠 액션). 우측하단도 챗봇/개발자패널류 위젯 자리 관례와 겹쳐 기각. Fluent 2 Design System 공식 Drawer 가이드("주 액션은 다른 버튼의 왼쪽에 배치")를 근거로 하단좌측 확정.
- **본문 편집 UI는 저장에 연결하지 않음(의도적 미완성)**: `sources.body`를 저장하는 API가 아직 없다(코드베이스 확인). 지금 상태로 기존 추출 뮤테이션에 연결하면 "편집한 내용이 조용히 무시되는" 실패가 생기므로 클릭 핸들러 자체를 안 붙였다 — 백엔드 준비 후 연결 필요(후속 작업으로 남김).
- **재생성 비활성화 — `empty` 상태에 한정**: 원문이 안 바뀐 채 재시도하면 결과없음이 또 나올 가능성이 높은 `empty`만 원문 미변경 시 비활성화. `failed`/`cancelled`는 내용이 원인이 아닐 수 있어 이 제약을 안 둠.
- **상태 아이콘 툴팁 — 비대칭 적용**: `failed`(TriangleAlert)는 업계에서 이미 명시적인 경고 기호라 툴팁 없음. `empty`(SearchX)는 관용화된 기호가 아니라 툴팁으로 의미 보완("Nothing to generate"). `cancelled`는 아이콘 자체 없음(자기 행동이라 설명 불필요). 일괄 규칙이 아니라 실제로 모호한 것만 골라 적용.
- **타이틀을 카드 헤더로 승격, "Untitled" 임시 텍스트 추가**: 백엔드가 타이틀 생성 LLM 호출을 다이제스천 완료 호출에서 분리하기로 하면서, 기존에 검증했던 "title과 digestion 완료는 원자적으로 결합돼 있어 processing 중엔 title이 존재 불가"라는 전제가 깨졌다 — title이 앞으로는 Working 상태에서도 존재할 수 있다. 카드 하단 풋터를 상단 헤더로 올리고 시각 왼쪽에 "Untitled" 자리를 미리 마련했다("Untitled" 문자열 자체는 타이틀 분리 작업 완료 전까지 임시).
- **미반영 상태로 남은 것(후속 슬라이스 몫)**: 타이틀 편집(`EditSourceTitleDialog`)·Space 재지정(`DraftSpaceSelect`)·삭제(`DeleteSourceDialog`) 등 기존 idle 액션 컴포넌트가 이번 상태별 분리 이후 새 카드/상세 구조에 아직 재연결되지 않았다 — 타이틀이 실제 기능이 되는 시점(백엔드 분리 완료)에 맞춰 재연결 여부·위치를 다시 판단해야 한다.

---

### 2026-07-15 — 디자인 폴리싱: 초안 액션 재연결 + 팝업 표면(드롭다운/셀렉트/모달) 전역 통일

바로 위 항목의 "미반영 idle 액션"을 전부 재연결했고, 그 과정에서 드롭다운/셀렉트/모달의 시각 언어를 앱 전체 단위로 통일했다.

**초안(Drafts) 액션 재연결**

- **삭제 — 카드(호버 리빌)+상세 헤더 양쪽에 재연결**: 기존 `DeleteSourceDialog`/`useDeleteSource`를 그대로 재사용. 상세에서 삭제하면 다이얼로그만 닫던 기존 컴포넌트에 `onDeleted` 콜백을 추가해 패널 자체도 같이 닫히게 했다 — 안 닫으면 이미 삭제된 항목이 패널에 계속 떠 있는 상태가 됨.
- **Space 재지정 — Select가 아니라 pill 자체를 드롭다운 트리거로**: `DraftSpaceSelect`(weave `Select` 기반)를 새로 쓰지 않고, 헤더의 Space pill을 `DropdownMenu` 트리거로 바꿨다 — 상세 헤더 안에서 pill의 시각적 무게를 유지하려면 박스형 Select 트리거보다 pill 그대로가 자연스럽다는 판단. 선택 표시는 처음엔 `DropdownMenuRadioGroup`(좌측 원형 점)이었다가, weave `Select`의 우측 체크마크 관례를 따르는 게 이 앱의 기존 패턴과 더 맞다고 판단해 평범한 `DropdownMenuItem`+수동 체크마크로 바꿨다. 이 재구성으로 `DraftSpaceSelect.tsx`/`DraftIdleActions.tsx`(추출·삭제·Space재지정을 한데 묶었던 옛 컴포넌트)가 완전히 중복돼 삭제했다.
- **제목 — Idle 상세에 실제 저장 연동**: 기존 `useUpdateSourceTitle`/`update_source_title` RPC를 그대로 재사용해 인라인 제목 입력에 blur 시 저장을 붙였다. 본문(body)과 달리 제목은 이미 저장 API가 있어 실제로 연동했다 — 단, 스키마가 빈 제목 저장을 막고 있어(`min(1)`) 지우고 나가면 저장 시도 자체를 안 하고 이전 값이 남는다(빈 제목을 지원하려면 스키마 변경이 먼저 필요, 이번 스코프 아님).
- **결과없음 카드 아이콘 — 상세 편집과 실시간 연동**: 상세에서 원문을 실제로 고치면(재생성 버튼이 풀리는 조건과 동일: `body !== draft.body`) 리스트 카드의 SearchX 아이콘도 같이 사라진다. 카드와 상세가 다른 컴포넌트 인스턴스라 이 "편집됨" 상태를 `DraftsScreen`(공통 부모)이 들고 양쪽에 내려주는 구조로 구현 — `failed`/`cancelled` 아이콘은 이 로직 대상이 아님(원래도 편집 여부와 무관).

**팝업 표면 전역 통일**

- **공유 상수 `POPOVER_SURFACE_CLASSNAME`(`packages/weave/src/utils.ts`) 신설**: `DropdownMenuContent`/`SelectContent`/`DialogContent`/앱의 `DevToolbar` 패널까지 전부 이 상수로 배경·보더·그림자를 통일. 라이트는 그림자로, 다크는 보더로 경계를 표현(다크에서는 그림자가 존재감이 약해 보더 쪽이 낫다고 판단). `Select`와 `DropdownMenu`는 서로 다른 Radix primitive(폼 컨트롤 vs 액션 메뉴)라 완전히 하나로 합칠 순 없어, "겉보기 표면 스타일만" 공유하는 선에서 통일했다.
- **다크 전용 신규 토큰 `surface-overlay`**: 기존엔 팝업 배경이 `surface-card`라 LNB(`surface-base`)와는 구분됐지만 메인 콘텐츠·사이드뷰(둘 다 `surface-card`)와는 다크에서 안 구분됐다. LNB·메인·사이드뷰 어느 것과도 안 겹치는 새 값(`#363230`, card와 raised-hover 사이)을 팔레트→시맨틱→Tailwind 3계층에 전부 추가했다 — 기존 `surface-raised-hover`를 재사용하지 않은 이유: 드롭다운 아이템 호버가 이미 이 토큰을 쓰고 있어서, 팝업 배경까지 같은 값이면 호버해도 구분이 안 됨.
- **DropdownMenu의 overflow가 자기 그림자를 가리던 버그**: `overflow-x-hidden overflow-y-auto`(스크롤용)가 그림자를 가진 바로 그 요소에 같이 걸려 있어서 그림자가 안 보였다. 오버플로우 클리핑을 안쪽 스크롤 전용 래퍼로 옮기고, 바깥 박스(보더·그림자·배경)는 클리핑 없이 그대로 뒀다. `Select`는 이번엔 손대지 않음(v2에서 더 이상 채택 안 할 예정이라 우선순위 낮음).
- **Tailwind가 `packages/weave`(pnpm 워크스페이스 심볼릭 링크) 안 변경을 반영 안 하던 문제**: Tailwind v4 기본 콘텐츠 스캔이 심볼릭 링크 너머 패키지까지 안 따라가서, `utils.ts`처럼 클래스명이 문자열 상수로만 존재하는 파일은 값을 바꿔도 컴파일된 CSS에 전혀 반영되지 않았다(서버 재시작·캐시 삭제로도 해결 안 됨 — 애초에 스캔 대상이 아니었던 것). `apps/web/src/index.css`에 `@source "../../../packages/weave/src/**/*.{ts,tsx}"`를 추가해 명시적으로 스캔 대상에 포함시켜 해결.
- **Select만의 자동 포커스는 그대로, DropdownMenu엔 억지로 안 만든다(확정)**: Space 재지정 드롭다운에서 "열릴 때 현재 선택값에 포커스"를 `onOpenAutoFocus`+`ref`로 흉내 내봤으나, Radix의 `DropdownMenu.Content`는 이 prop이 타입 선언엔 없고(실제 런타임엔 있음 — `radix-ui` 재노출 패키지의 타입 갭으로 확인됨) 걸어도 유지보수 비용이 계속 발생했다. Select의 자동 포커스는 `listbox`/`combobox` 시맨틱을 가진 진짜 폼 컨트롤이라 Radix가 공짜로 주는 네이티브 동작이고, DropdownMenu는 애초에 "현재 값" 개념이 없는 액션 메뉴 primitive라 이 동작을 억지로 맞출 이유가 없다고 최종 판단 — 커스텀 코드를 전부 걷어내고 선택 표시는 체크마크만 남겼다.

---

### 2026-07-15 — 초안 상세: 본문 편집 저장 연동 + 리뷰 반영 + 네이밍 정리

- **본문 편집 저장 — 이전 미완성 갭 해소**: `update_source_body` RPC(#415) 착지로 직전 항목(656줄, "저장 API가 아직 없어 클릭 핸들러 자체를 안 붙였다")의 백엔드 전제가 사라졌다. 제목과 동일 패턴(blur 저장, 인라인 Alert, `skipGlobalToast`)으로 배선.
- **Regenerate 클릭 — 저장을 먼저 기다린 뒤 재추출**: blur 타이밍에 기대지 않고, 클릭 시점에 편집 여부를 확인해 저장이 필요하면 그 완료를 먼저 기다린 뒤 재추출을 호출한다. 저장 실패 시 재추출로 안 넘어가도록 순서를 명시적으로 강제 — 두 뮤테이션이 각자 실패할 수 있는 상황에서 "저장 안 된 내용으로 재생성"되는 걸 막기 위함.
- **훅 네이밍 `useExtractSource` → `useStartSourceDigestion`**: 이 훅이 이제 재시도(Extract)·Regenerate 양쪽에서 불리는데, 이름이 그중 하나의 UI 문구를 편들면 안 된다는 판단 — UI 라벨과 코드 식별자를 분리하고, 형제 훅들(`useCancelSource` 등)의 "Source + 도메인 동작" 네이밍에 맞춤.
- **상세 패널 stale 상태 수정 — 선택은 id만 보관, 나머지는 파생**: `selectedDraft` 객체를 그대로 들고 있으면 폴링 갱신과 재동기화가 안 됨(타이틀 비동기 도착·processing→완료/실패 전환이 열린 패널에 반영 안 됨). `selectedSourceId`만 들고 매 렌더 최신 쿼리 데이터에서 다시 찾아 만드는 구조로 바꿈.
- **RelativeTime 커스텀 버킷 로직에 테스트 추가**: 직전 항목(665줄)에서 date-fns 문구를 커스텀 압축 포맷으로 교체하면서 그 계산 로직이 프레임워크 보장 동작이 아니게 됐는데 테스트가 없었다 — 순수함수로 추출 + 경계값(59분59초/60분 등) 테스트 추가. CLAUDE.md "runtime/framework 보장 동작은 테스트 안 함" 원칙이 커스텀 대체 이후엔 더 이상 적용 안 되는 사례.
- **Popover 팝업 표면 통일 누락 보정**: 직전 항목(695~698줄)의 `POPOVER_SURFACE_CLASSNAME` 전역 통일 작업에서 `Popover.tsx`가 빠져 다크모드에서 혼자 달라 보였던 게 이번에 발견·수정됨 — 통일 대상 컴포넌트 목록에 Popover 포함 확정.

---

### 2026-07-15 — 초안 탭 "AI가 진행 중인 작업" 용어를 "정리"/"Organize"로 통일

**배경**: 상세 사이드뷰에 처리중 인지 인디케이터를 추가하다 보니, Put-in→Digest Review 사이의 이 AI 작업을 코드베이스가 "Working"/"처리 중", "Regenerate"/"재생성", "Creating"/"작성 중", "Generate"/"생성" 등 화면마다 다른 단어로 부르고 있다는 게 드러났다.

**"정리"/"Organize" 채택 근거**: (1) `session.empty_subheading_1`("정리는 맡겨두세요."/"The organizing is on us.")이 이미 Nema의 핵심 가치 제안을 이 단어로 못박아둔 브랜드 레벨 카피였다. (2) `glossary.md`의 Digest 정의 자체가 "Source를 사람이 읽기 좋게 **정리한 것**"이라 — "정리 중"으로 부르면 진행형 라벨과 완료 결과물 정의가 한 단어로 자연스럽게 이어진다. (3) Mem.ai("Mem organizes every capture"), Notion AI, Capacities 등 AI-native SaaS가 이 raw→구조화 전환을 "generate"가 아니라 "organize/structure"로 부르는 게 트렌드 — Statement가 사용자 원문 기반 판단을 담는 단위(새로 지어내지 않음)인 Nema 모델과 "생성"보다 "정리"가 더 정직하게 맞는다.

**적용 범위**: Ask 플로우(`session.status_answering` "답변 생성 중..." 등 — narration은 실제로 근거에서 산문을 합성하는 진짜 "생성"이라 별개)와 v1 세션 레거시 키(`session.draft_creating` 등 — glossary "폐기된 용어"의 v1 Draft 개념, v2 초안과 무관)는 스코프 밖. v2 Drafts 탭(intake feature)의 번역키·컴포넌트만 교체:

| Before (key/값) | After (key/값) |
|---|---|
| `draft_section_working` "Working"/"처리 중" | `draft_section_organizing` "Organizing"/"정리 중" |
| `draft_regenerate` "Regenerate"/"재생성" | `draft_organize` "Organize"/"정리" |
| `draft_regenerating` "Regenerating..."/"재생성 중..." | `draft_organizing` "Organizing..."/"정리 중..." |
| `draft_processing`(죽은 키) | 삭제 — `draft_section_organizing`으로 통합 |
| `draft_processing_elapsed_*` | `draft_organizing_elapsed_*` (값은 그대로, 접두어만) |
| `draft_no_result_tooltip` "Nothing to generate"/"생성할 내용이 없어요." | 값만 "Nothing to organize"/"정리할 내용이 없어요." |

코드 식별자(`handleRegenerate`, `useStartSourceDigestion`, `draft.regenerate` 단축키 액션 ID 등)는 안 건드림 — glossary의 "제품 용어는 카피 전용, 코드 용어는 구현체" 원칙대로 유지(`useStartSourceDigestion`이 애초에 이 분리를 이유로 그렇게 지어졌다).

---

### 2026-07-15 — 검토 대기 Changeset 넛지: 알림 채널·카운트 배지 색 규칙

**배경**: 초안 정리가 끝나면 Changeset이 열린 상태로 생기는데, 이 전환을 사람이 놓치지 않게 하는 알림 채널이 없었다. `design-reference-log.md` "⑥ 작업 완료 알림" 참고.

**알림 채널 — 지속되는 카운트 배지로 확정, 토스트·자동 라우트 이동은 기각**: 이 이벤트는 LangChain의 Notify/Review/Question 모델 기준 Review급(사람이 반드시 검증)이라, 토스트(자동으로 사라짐·접근성 문제)나 정리 완료 시 자동 리뷰 화면 이동(사용자 통제권 박탈, Space 생성 후 auto-navigate 제거 전례와 같은 이유)보다 지속적으로 보이는 배지가 맞다고 판단. Space LNB 행과 Space 오버뷰의 변경사항 탭 양쪽에 동일 카운트(그 Space의 `pending` changeset 수)를 배지로 노출 — "읽음"이 아니라 confirm/discard 처리 시에만 사라지므로 별도 읽음 상태 관리가 필요 없다.

**카운트 배지 색 — neutral(백로그)·info tint(검토 대기)·error(실패) 3단 확정**: 처음엔 warning을 검토했으나 "warning은 무시하면 에러가 날 위험이 있는 상태"에 쓰는 톤이라 단순 검토 대기와 안 맞아 기각(웹서치 기반). 최종적으로 neutral은 "아직 시작 안 한 백로그"(초안 탭 카운트), info는 "AI가 끝냈고 사람 차례로 넘어온 워크플로우 진행 상황"(변경셋 카운트), error는 기존 실패 상태 전용으로 역할을 나눴다. info도 처음엔 solid 배경+흰 텍스트로 시도했으나 화면 전체가 무채색인 Nema 톤에서 유일한 고채도 요소가 되어 과했다 — weave `Badge`의 `info` variant(tint 배경) 기본값으로 되돌림. 이 판단은 "Space 아이콘 — 색상 실험 후 중립으로 회귀"(위 항목)와 같은 반복 패턴 — 리스트/네비게이션 안 색 배지는 solid보다 tint가 Nema 톤에 맞는다는 규칙으로 일반화할 수 있음.

**미해결(후속 논의로 이월)**: `useSpaceList`가 10분 staleTime이라 changeset 생성·해소가 실시간으로 반영 안 됨. 초안 탭 폴링 패턴(`usePendingSourceListQuery`의 조건부 `refetchInterval`)을 재사용하는 안을 제시했으나 "별로 좋은 방향은 아닌 것 같다"는 피드백으로 보류 — 갱신 전략은 다음 세션에서 다시 논의.

---

### 2026-07-16 — 상태 색 체계 재정정: Changeset 배지는 info(파랑)가 아니라 success(초록), "정리 중"은 info(파랑)

바로 위 항목의 "카운트 배지 색" 판단(neutral·info·error 3단)을 뒤집는다. append-only 원칙상 위 항목은 고치지 않고 최종 규칙만 여기 남긴다.

**계기**: 일반 엔터프라이즈 디자인 시스템(Carbon 등) 기준으로 info(파랑)를 채택했으나, PM이 OpenAI Codex Micro(하드웨어 키패드, 2026-07-15 출시)의 실제 상태등 관례를 제시 — Agent Key RGB 매핑이 **white=idle · blue=thinking(작업 중) · green=complete(완료) · amber=input required(입력 필요) · red=error**. 이게 일반 디자인 시스템보다 Nema의 실제 성격(AI가 비동기로 작업하고 결과를 사람이 확인)에 더 직접 대응하는 레퍼런스라고 판단해 재검토했다.

**핵심 구분**: Codex의 "amber(input required)"는 에이전트가 작업 도중 막혀서 사람에게 물어봐야 하는 상태다 — Nema엔 이런 상태가 없다. Changeset이 생기는 시점은 AI가 결과물(Digest·Statement)을 **이미 다 만들어낸 뒤**라 Codex 기준 "green(complete)"에 해당한다. 반대로 "정리 중"(digestion 진행 중)이 정확히 "blue(thinking)"에 해당하는데, 기존엔 이 상태를 표시하는 색이 아예 없었다(중립 회색 pulse).

**최종 색 배정 3단(확정)**:
- **주황(warning)** — 초안 탭 "확인 필요"(Waiting for you): 사람이 손대야 진행되는 상태. 기존 그대로.
- **파랑(info)** — "정리 중"(Organizing) 배너·섹션 배경 tint·pulse 아이콘: AI가 실제로 작업 중인 상태. 이번에 새로 배정.
- **초록(success)** — Changeset 검토 대기 배지(LNB·변경사항 탭): AI가 작업을 완료해 결과물이 나온 상태. info에서 재변경.

**섹션 헤더 텍스트는 tone과 무관하게 중립 유지**: `DraftSection`의 라벨·카운트 텍스트는 tone(warning/info)에 따라 색이 안 바뀐다 — 배경 tint와 아이콘만으로 상태를 신호하고, 문구 자체까지 물들이면 과하다는 판단(기존 warning 섹션의 관례를 그대로 따름). 경과 시간 카운터도 상태 신호가 아니라 부가 정보라 중립 유지.

**최초 반박이 틀렸던 이유(기록용)**: green을 처음 검토할 때 "리뷰 대기 항목을 초록으로 칠하면 이미 끝났다는 착각을 준다"는 GitHub PR 리뷰 커뮤니티 논쟁을 근거로 기각했었는데, 이건 AI 에이전트 맥락이 아니라 순수 사람-사람 코드리뷰 워크플로우 논쟁이었다 — Codex Micro라는 실제 AI 에이전트 하드웨어의 직접 사례가 나오자 이 근거는 기각됐다. 일반 UX 선례를 그대로 가져오기 전에 "AI가 만든 결과물을 사람이 확인하는 상황"이라는 Nema의 실제 성격에 맞는 레퍼런스인지부터 확인해야 한다는 교훈.

---

### 2026-07-16 — 브라우저 알림(탭 밖 신호) 설계 확정, 새 세션에 구현 위임

**목적(한 줄)**: 배지가 커버 못 하는 사각지대(사용자가 Nema 밖에 있는 동안)에서도 AI가 결과물을 완성했다는 사실을 그 순간에 전달한다 — 단, 급하다는 인상은 주지 않는다.

**발화 조건**: `changesets` INSERT만(정리 성공 시), 탭이 안 보일 때만(`document.hidden`). UPDATE(confirm/discard)는 사용자 자신의 행동 결과라 제외.

**빈도 — 문턱·디바운스·쿨다운 전부 없음, 완료마다 즉시 알림**: 개수 문턱을 두면 "원본 하나만 던지고 자리를 비운" 시나리오(이 기능이 가장 필요한 경우)에서 알림이 아예 안 뜨는 모순이 생겨 기각. 인위적 지연(디바운스)은 "왜 안 오지" 불안을 새로 만들어 오히려 목적을 해침(Claude Code·Slack도 즉시 알림, 묶지 않음). Nema의 실제 볼륨(유저당 하루 한 자릿수)도 "폭풍" 방지가 필요할 만큼 높지 않음. 비정상 반복 생성은 알림 레이어가 아니라 트리거 원인에서 막을 것.

**콘텐츠 — Title/Body 확정, 구체 내용 노출 안 함**: `ko: Nema / Nema에 리뷰가 필요해요`, `en: Nema / Nema needs your review`(마침표 없음, 의도적). Space 이름·Changeset 제목은 안 넣음 — Nema가 회의록·개인 메모 등 민감한 내용을 저장하는 도구라 잠금화면·화면공유 노출 시 프라이버시 리스크(Claude Code 공식 알림이 제네릭한 것과 같은 이유, `design-reference-log.md` "⑥" 참고). "리뷰"라는 어휘는 `review.status_pending`/`review.tab_open`과 통일.

**권한 요청 — Soft ask(double permission) 패턴, 필수**: 네이티브 권한 요청을 먼저 띄우지 않는다. 유저의 첫 Changeset 생성 직후 자체 인앱 UI로 먼저 설명 → 동의 시에만 네이티브 `Notification.requestPermission()`. 근거·업계 사례는 `design-reference-log.md` "⑥"에 기록.

**구현은 새 세션에 위임(미착수)**: 기존 Realtime 구독(`useRealtimeInvalidation.ts`, PR #419)에 얹는 형태로 스코프. 상세 스펙은 핸드오프 프롬프트로 별도 전달.

---

### 2026-07-17 — Space 삭제: 대기 초안 "함께 삭제" 옵션 추가 (PR #424 후속)

**배경**: `SpaceDeleteConfirmForm`(PR #424가 select→이름 입력 순서, 필드/footer 분리 Suspense로 재구성)의 이동 위치 select가 지금까지 "다른 Space로 이동"만 지원했다 — 대기 초안을 보존하는 안전한 기본값이지만, Space 자체를 통째로 정리하고 싶은 경우(실험용/취소된 프로젝트) 초안이 다른 Space로 흘러들어가는 게 오히려 원치 않는 결과였다. 백엔드에 `delete_space`의 `p_delete_pending_drafts` 플래그가 추가되면서 FE도 이 선택지를 명시적으로 노출.

**Select 옵션을 항상 렌더링 — 대상 Space가 1개뿐이어도 텍스트 폴백 안 씀**: 기존엔 `otherSpaces.length <= 1`이면 select 대신 평범한 텍스트로 유일한 대상 Space 이름만 보여줬다("고를 게 없으니 select 자체가 불필요"는 판단). 이제는 "함께 삭제"가 대상 Space 개수와 무관하게 항상 유효한 선택지라, 대상이 하나뿐이어도 select는 그대로 유지하고 그 하나의 이동 옵션 + 삭제 옵션 두 가지를 고르게 한다.

**옵션 라벨을 "자기 설명형"으로 바꿈**: 기존엔 라벨(`delete_move_drafts_label`, "초안 N개를 이동할 위치")이 "이동"이라는 의미를 이미 지고 있어서 아래 select item엔 Space 이름만 있으면 충분했다. 이제 select 안에 "이동" 계열과 "삭제" 계열 옵션이 같이 있으므로, 라벨은 중립적인 사실만 말하게 하고(`delete_pending_drafts_label`, "확인 필요 초안 N개") 각 item이 스스로 뜻을 설명하게 했다("{name}으로 이동" / "스페이스와 함께 영구 삭제") — 라벨만 보고는 뭘 고르는 건지 모호해지는 걸 막기 위함.

**"함께 삭제" 옵션에 danger 톤 적용, weave `Select`엔 `variant` prop 안 만듦**: `DropdownMenuItem`엔 이미 `data-[variant=danger]` 패턴(`text-status-error`/`focus:bg-status-error-tint`)이 있지만, `SelectItem`엔 이런 위험도 구분 자체가 필요했던 소비처가 지금까지 없었다. 이번 한 곳만을 위해 weave 컴포넌트에 새 prop을 추가하는 대신, `DropdownMenuItem`이 쓰는 것과 같은 토큰을 `className`으로 직접 얹었다(기존 코드베이스에도 `SelectItem`에 케이스별 `className`을 얹는 선례 다수 — `ThemeSelect`, `ReferenceCandidateCard` 등). 소비처가 늘면 그때 `variant` prop 승격을 재검토.

**옵션 목록 안에서 구분선으로 위험도 분리**: 이동 옵션들과 삭제 옵션 사이에 `SelectSeparator`를 넣어 "다른 종류의 선택"이라는 시각적 신호를 하나 더 얹었다 — 색만으로 구분하면 목록이 길어졌을 때(Space가 많은 워크스페이스) 위험한 옵션이 다른 이동 옵션들 사이에 섞여 눈에 덜 띌 수 있어서.

**기본 선택은 그대로 "이동"(가장 오래된 다른 Space)**: 새 옵션 추가로 기본값 자체는 안 바꿨다 — "함께 삭제"는 명시적으로 골라야만 실행되는, 07-modeling.md 원칙(Source는 손대지 않고 그대로 박제)에 맞는 안전한 기본을 유지.

---

### 2026-07-17 — 버려진 리뷰의 원본이 초안 탭에서 "결과없음"으로 오분류되던 문제 해결

**해결**: 같은 날 다른 세션(polish/changeset)이 "미해결로 남긴 것"으로 킥오프 프롬프트만 써서 별도 세션(`fix/discarded-draft-status`)에 위임했던 갭 — `discard_ingestion_review`가 `sources.digestion_status`는 안 건드려 `completed`로 남기 때문에, `draftStatus()`가 이걸 진짜 결과없음(`empty`)과 구분 못 하고 있었다. 그 세션이 확정해둔 설계 그대로 착지: `listPendingSources`가 `type='ingestion'` changeset을 `pending`뿐 아니라 `rejected`까지 함께 조회해 `hasDiscardedReview`(원본별 rejected changeset 존재 여부)를 `PendingSourceItem`에 additive로 추가하고, `draftStatus()`는 `digestion_status='completed'`일 때 이 플래그로 `empty`/`discarded`(신설 `DraftStatus` 값)를 가른다. UI는 `cancelled`와 동일하게 아이콘·툴팁 없이 평범한 대기 카드로 처리(`IdleDraftCard`가 `status === "empty"`만 보므로 `discarded`는 자동으로 아무 아이콘도 안 그린다) — `IdleDraftDetailPanel`의 재시도 비활성화 가드(`status === "empty" && !bodyDirty`)와 `DraftList`의 "확인 필요" 섹션 분류(`status !== "processing"`)도 같은 이유로 코드 변경 없이 자동으로 맞물렸다.

**정확도 범위를 의도적으로 좁힘 — "rejected changeset이 하나라도 있는가"만 보고 시점(가장 최근 시도 이후인지)은 안 따진다**: 버림 → 원본 편집 → 재시도했는데 이번엔 진짜로 empty인 드문 시퀀스에서 과거 rejected changeset 때문에 여전히 `discarded`로 잘못 표시될 수 있다. `last_digestion_attempt`와 rejected changeset의 시각을 비교하는 correlate 로직까지 이번 스코프에 넣는 건 드문 엣지케이스 대비 과설계로 판단해 뺐다 — 실사용에서 체감되면 그때 추가.

**검증**: 로컬 Supabase(빈 DB)에 테스트 유저로 rejected changeset 있는 원본 하나, 진짜 결과없음 원본 하나를 직접 시딩해 `source.listPending`을 실제로 호출 — `hasDiscardedReview`가 각각 `true`/`false`로 정확히 갈리는 것을 API 응답으로 직접 확인(브라우저 자동화 도구를 이 세션에서 못 붙여 API 레벨로 대체). `pnpm typecheck`/`lint`/`test`(server 436케이스, web 123케이스 — `utils.test.ts`에 discarded 케이스 1건 추가) 모노레포 전체 통과. 브라우저 실동작(라이트/다크, 아이콘 유무)은 세션 환경 제약으로 Kyle이 직접 확인.

---

### 2026-07-17 — Space Overview: 탭 전환 시 스크롤·서브탭 유지

**배경**: Thread↔Changes가 서로 다른 라우트라 전환마다 하위 트리 전체가 언마운트/재마운트돼, Changes 안 Open/Closed 서브탭(로컬 `useState`)과 스크롤 위치가 매번 초기화됐다. 라우트를 하나로 합치는 재구조화는 이번 스코프 밖(PM 확정) — 기존 두 라우트 구조를 유지한 채 그 위에 상태 영속만 얹었다.

**스크롤 복원 — `useScrollAnchor.ts`는 그대로 재사용하지 않음**: 그 훅은 "같은 컴포넌트 인스턴스가 살아있는 동안 메시지 추가에 맞춰 스크롤을 재조정"하는 문제(ref는 마운트 내내 유지)라, "컨테이너 자체가 언마운트됐다가 다른 시점에 재마운트됐을 때 이전 위치를 복원"하는 이번 문제와 전제가 다르다. 참고한 건 오직 "named effect + cleanup에서 리스너 해제" 골격뿐, 앵커링 로직 자체는 재사용 대상이 아니었음. 신규 `useMainScrollRestoration(key)`은 컴포넌트 state가 아니라 모듈 스코프 `Map<string, number>`에 스크롤값을 둔다 — key별 위치는 세션 동안만 유지되면 충분해(새로고침·탭 재방문 시 처음부터 봐도 무방) sessionStorage 직렬화·읽기 비용을 들일 이유가 없었다. Context/Provider로 워크스페이스 셸에서 내려주는 안도 검토했으나, 이 정도 캐시엔 React 트리 경유가 과설계라 판단해 기각. **key엔 `subTab`까지 포함**(`spacePublicId:changesets:open|closed`, topic은 `spacePublicId:topic`) — Open/Closed 전환은 같은 라우트 안 search param 변경이라 컨테이너가 언마운트되지 않는데, key에 activeTab까지만 있으면 effect가 재실행 안 돼 Open에서 보던 스크롤 값이 그대로 Closed 콘텐츠에 얹히는 leak이 있었다(코드리뷰에서 발견, 초기 구현 갭).
**서브탭 — `ChangesPanel.tsx`는 최대한 얇게, 상태 소유는 라우트로 이동**: 이 파일이 같은 시점에 다른 세션(`polish/changeset`, row 레벨 폴리싱)이 동시에 건드리는 중이라, diff 충돌 표면을 줄이려고 로컬 `useState`를 controlled props(`subTab`/`onSubTabChange`)로만 바꿨다 — 상태 자체의 소유·URL 동기화 로직은 전부 `app/router.tsx`의 `SpaceChangesShell`로 옮겨서 이 파일엔 로컬 `useState`를 controlled props로 바꾸는 최소 diff만 남았다. `ChangesSubTab` 타입은 `features/review/types.ts`로 승격해 app 레이어(`router.tsx`)에서도 참조 가능하게 export.
**`SpaceOverview`/`SpaceOverviewPage` props를 discriminated union으로**: `activeTab: "changesets"`일 때만 `subTab`/`onSubTabChange`가 필요해, optional prop 대신 유니온으로 타입 레벨에서 강제했다(topic 분기에서 subTab을 실수로 참조하면 컴파일 에러). 대신 `props.activeTab === "changesets"` 형태로만 좁혀지므로(구조분해한 로컬 변수로는 안 좁혀짐) 그 분기 안에서는 원본 `props` 객체를 그대로 참조.
**라우트 검색 파라미터는 route 인스턴스 메서드로**: 처음엔 `useSearch({ from: "/space/$spacePublicId/changes" })` 문자열 경로 방식(`SignInPage` 선례)을 썼는데, 이 라우트가 `_authenticated`/`_workspaceSidebar` id 전용 부모 아래 중첩돼 있어 등록된 전체 경로 리터럴과 안 맞아 타입 에러가 났다. `spaceChangesRoute.useSearch()`/`useNavigate()`(라우트 객체 자신의 메서드, 이미 `useParams()`에 쓰이던 것과 같은 패턴)로 바꾸니 별도 경로 문자열 없이 타입이 맞았다 — 중첩 id 라우트에서는 이 방식이 더 안전.
**Thread 탭 — 지금은 손댈 대상 없음, 구조상 자동 커버**: Thread(topic) 탭은 아직 `SourceComposer` 아래가 빈 스텁이라 스크롤할 콘텐츠가 없다. 복원 훅을 `SpaceOverview`의 공용 스크롤 컨테이너(`data-main-scroll-area`)에 `activeTab` 포함 key로 걸어뒀기 때문에, 후속 세션이 Thread 피드를 채워도 이 훅을 다시 손대지 않고 그대로 적용된다.
