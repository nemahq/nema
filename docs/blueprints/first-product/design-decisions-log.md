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
