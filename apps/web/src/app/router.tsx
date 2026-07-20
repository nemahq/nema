import { Suspense, useCallback } from "react";
import { z } from "zod";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";

import { getEnv } from "@web/app/env";
import { notFoundAtRoot } from "@web/app/error/notFound";
import { NotFoundErrorFallback } from "@web/app/error/NotFoundErrorFallback";
import { RouteErrorFallback } from "@web/app/error/RouteErrorFallback";
import { AppLayout } from "@web/app/layouts/AppLayout";
import { ChangesetDetailPage } from "@web/app/pages/ChangesetDetailPage";
import { ComingSoonPage } from "@web/app/pages/ComingSoonPage";
import { DraftsPage } from "@web/app/pages/DraftsPage";
import { OAuthConsentPage } from "@web/app/pages/OAuthConsentPage";
import { PrivacyPage } from "@web/app/pages/PrivacyPage";
import { SessionPage } from "@web/app/pages/SessionPage";
import { SignInPage } from "@web/app/pages/SignInPage";
import { SpaceOverviewPage } from "@web/app/pages/SpaceOverviewPage";
import { TermsPage } from "@web/app/pages/TermsPage";
import { WorkspaceHomePage } from "@web/app/pages/WorkspaceHomePage";
import { ContentAreaFallback } from "@web/components/layout/ContentAreaFallback";
import { requireAuth, requireGuest } from "@web/features/auth";
import { HarnessPage } from "@web/features/dev-harness";
import type { ChangesSubTab } from "@web/features/review";
import { SessionSidebar } from "@web/features/session/components/SessionSidebar";
import {
  useSpaceList,
  useWorkspaceBootstrapQuery,
  WorkspaceSidebar,
} from "@web/features/workspace";
import { getStorage, setStorage } from "@web/utils/localStorage";

import { App } from "./App";

const rootRoute = createRootRoute({
  component: App,
  errorComponent: RouteErrorFallback,
});

// -- 공개 라우트 --

// 스텔스 모드(프로덕션)에서는 로그인 대신 Coming Soon을 보여준다. /signin?access=<key>로
// 프리뷰를 한 번 열어두면 같은 브라우저에서는 계속 실제 로그인이 뜬다.
function SignInRoute() {
  const stealth =
    getEnv().APP_ENV === "production" && getStorage("previewAccess") !== "true";
  return stealth ? <ComingSoonPage /> : <SignInPage />;
}

const signinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signin",
  validateSearch: z.object({
    redirect: z.string().optional(),
    access: z.string().optional(),
  }),
  component: SignInRoute,
  beforeLoad: async ({ search }) => {
    const previewKey = getEnv().PREVIEW_KEY;
    if (previewKey && search.access === previewKey) {
      setStorage("previewAccess", "true");
    }
    await requireGuest();
  },
});

const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/privacy",
  component: PrivacyPage,
});

const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/terms",
  component: TermsPage,
});

// 인증은 필요하지만 앱 레이아웃(사이드바) 없이 단독으로 뜨는 OAuth 동의 화면.
const oauthConsentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/oauth/consent",
  validateSearch: z.object({
    authorization_id: z.string().optional(),
  }),
  component: OAuthConsentPage,
  beforeLoad: ({ search, location }) => {
    // 구글 등 OAuth 공급자 왕복에서 URL 쿼리가 깎여 authorization_id가 사라질 수
    // 있어, 진입 시점에 저장해 두고 페이지가 복구하게 한다.
    if (search.authorization_id) {
      setStorage("oauthAuthorizationId", search.authorization_id);
    }
    return requireAuth(location.href);
  },
});

// -- 인증 라우트 --

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_authenticated",
  component: AppLayout,
  beforeLoad: ({ location }) => requireAuth(location.href),
});

const sessionSidebarRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "_sessionSidebar",
  component: () => (
    <>
      <SessionSidebar />
      <Suspense fallback={<ContentAreaFallback />}>
        <Outlet />
      </Suspense>
    </>
  ),
});

function SessionPageShell() {
  const { sessionId } = sessionRoute.useParams();
  return <SessionPage key={sessionId} />;
}

const sessionRoute = createRoute({
  getParentRoute: () => sessionSidebarRoute,
  path: "/session/$sessionId",
  component: SessionPageShell,
  errorComponent: RouteErrorFallback,
});

// bootstrap·space.list 실패는 LNB·Space 화면 전체가 뜰 수 없는 상태 — 반쪽 렌더(빈
// 계정 메뉴·Space 0개 착시) 대신 셸 전체를 라우트 에러 폴백으로 올린다. LNB의 Space
// 목록과 SpaceOverview 둘 다 space.list 하나에 의존하므로 이 레이아웃 한 곳에서 막으면
// 충분하다. Sentry 보고는 쿼리 meta(reportToSentry)가 담당한다.
function WorkspaceSidebarLayout() {
  const bootstrapQuery = useWorkspaceBootstrapQuery();
  const spaceListQuery = useSpaceList();
  if (bootstrapQuery.isError) {
    throw bootstrapQuery.error;
  }
  if (spaceListQuery.isError) {
    throw spaceListQuery.error;
  }

  return (
    <>
      <WorkspaceSidebar />
      <Suspense fallback={<ContentAreaFallback />}>
        <Outlet />
      </Suspense>
    </>
  );
}

// 새 LNB(워크스페이스·Space 스코프 셸)를 두르는 레이아웃 — 세션 사이드바와 형제.
// MVP IA 재구축이 진행되면서 새 화면들이 이 아래로 얹힌다.
const workspaceSidebarRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  id: "_workspaceSidebar",
  component: WorkspaceSidebarLayout,
  errorComponent: RouteErrorFallback,
});

const workspaceHomeRoute = createRoute({
  getParentRoute: () => workspaceSidebarRoute,
  path: "/",
  component: WorkspaceHomePage,
  errorComponent: RouteErrorFallback,
});

function SpaceOverviewShell() {
  const { spacePublicId } = spaceOverviewRoute.useParams();
  return (
    <SpaceOverviewPage
      key={spacePublicId}
      spacePublicId={spacePublicId}
      activeTab="topic"
    />
  );
}

const spaceOverviewRoute = createRoute({
  getParentRoute: () => workspaceSidebarRoute,
  path: "/space/$spacePublicId",
  component: SpaceOverviewShell,
  errorComponent: RouteErrorFallback,
});

function SpaceChangesShell() {
  const { spacePublicId } = spaceChangesRoute.useParams();
  const { subTab } = spaceChangesRoute.useSearch();
  const navigate = spaceChangesRoute.useNavigate();

  function handleSubTabChange(nextSubTab: ChangesSubTab) {
    void navigate({ search: { subTab: nextSubTab }, replace: true });
  }

  return (
    <SpaceOverviewPage
      key={spacePublicId}
      spacePublicId={spacePublicId}
      activeTab="changesets"
      subTab={subTab}
      onSubTabChange={handleSubTabChange}
    />
  );
}

const spaceChangesRoute = createRoute({
  getParentRoute: () => workspaceSidebarRoute,
  path: "/space/$spacePublicId/changesets",
  component: SpaceChangesShell,
  errorComponent: RouteErrorFallback,
  validateSearch: z.object({
    subTab: z.enum(["open", "closed"]).catch("open"),
  }),
});

// 열려 있는 초안 상세를 URL에 둔다 — 새로고침·링크 공유로 같은 상세가 다시 열리고,
// 뒤로가기가 패널 닫기가 된다.
function DraftsShell() {
  const { source } = draftsRoute.useSearch();
  const navigate = draftsRoute.useNavigate();

  // 히스토리에는 목록↔상세 전환만 남긴다 — 초안을 훑을 때마다 쌓이면 목록으로
  // 돌아가는 데 뒤로가기를 그만큼 눌러야 해서 "뒤로가기=패널 닫기"가 깨진다.
  // 이미 열려 있는 상태에서의 이동(다른 초안 선택·닫기)은 현재 항목을 갈아끼운다.
  const handleSelectSource = useCallback(
    function selectSource(sourceId: string | null) {
      void navigate({
        search: sourceId ? { source: sourceId } : {},
        replace: source !== undefined,
      });
    },
    [navigate, source],
  );

  return (
    <DraftsPage
      selectedSourceId={source ?? null}
      onSelectSource={handleSelectSource}
    />
  );
}

const draftsRoute = createRoute({
  getParentRoute: () => workspaceSidebarRoute,
  path: "/drafts",
  component: DraftsShell,
  errorComponent: RouteErrorFallback,
  validateSearch: z.object({
    source: z.string().optional().catch(undefined),
  }),
});

// open(리뷰 대기)·closed(기록) 상태와 무관하게 changeset 하나는 URL 하나 — GitHub의
// PR 번호 URL이 merge 여부와 무관하게 그대로인 것과 같다. 상태에 따라 어느 화면을
// 그릴지는 ChangesetDetailPage 안의 게이트가 정한다(라우트는 number만 안다).
function ChangesetDetailShell() {
  const { spacePublicId, changesetNumber } = changesetDetailRoute.useParams();
  return (
    <ChangesetDetailPage
      key={changesetNumber}
      spacePublicId={spacePublicId}
      changesetNumber={changesetNumber}
    />
  );
}

const changesetDetailRoute = createRoute({
  getParentRoute: () => workspaceSidebarRoute,
  path: "/space/$spacePublicId/changesets/$changesetNumber",
  component: ChangesetDetailShell,
  errorComponent: RouteErrorFallback,
});

// 내부 테스트 조종석 (NEM-125) — 프로덕션에서는 존재하지 않는 경로로 보인다
const devHarnessRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/dev",
  component: HarnessPage,
  errorComponent: RouteErrorFallback,
  beforeLoad: () => {
    if (getEnv().APP_ENV === "production") {
      throw notFoundAtRoot();
    }
  },
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  privacyRoute,
  termsRoute,
  oauthConsentRoute,
  authenticatedRoute.addChildren([
    sessionSidebarRoute.addChildren([sessionRoute]),
    workspaceSidebarRoute.addChildren([
      workspaceHomeRoute,
      spaceOverviewRoute,
      spaceChangesRoute,
      draftsRoute,
      changesetDetailRoute,
    ]),
    devHarnessRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: NotFoundErrorFallback,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
