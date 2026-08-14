import { z } from "zod";
import {
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import {
  DIGEST_PUBLIC_ID_PATTERN,
  SOURCE_PUBLIC_ID_PATTERN,
} from "@nema-io/shared";

import { getEnv } from "@web/app/env";
import { NotFoundErrorFallback } from "@web/app/error/NotFoundErrorFallback";
import { RouteErrorFallback } from "@web/app/error/RouteErrorFallback";
import { AppLayout } from "@web/app/layouts/AppLayout";
import { ComingSoonPage } from "@web/app/pages/ComingSoonPage";
import { DraftsPage } from "@web/app/pages/DraftsPage";
import { HomePage } from "@web/app/pages/HomePage";
import { OAuthConsentPage } from "@web/app/pages/OAuthConsentPage";
import { SignInPage } from "@web/app/pages/SignInPage";
import { requireAuth, requireGuest } from "@web/features/auth";
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
  errorComponent: RouteErrorFallback,
});

// 열려 있는 상세를 URL에 둔다(초안 화면과 같은 이유). digest와 source는 사이드뷰
// 한 자리를 나눠 써서 동시에 열리지 않는다 — 하나를 열면 다른 하나를 지운다.
// catch는 형식이 안 맞는 값(배열, public_id 패턴이 아닌 문자열 — 이 PR 이전에
// 발급된 uuid 형식 북마크·열린 탭 포함)을 여기서 비운다. 서버 입력 스키마도 같은
// 패턴을 검사하지만, 거기서 걸리면 NOT_FOUND가 아니라 BAD_REQUEST라 죽은 링크가
// 스스로 안 닫히고 에러 화면에 박힌다 — 형식 검증은 이 경계에서 끝내야 한다.
const homeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/",
  component: HomePage,
  errorComponent: RouteErrorFallback,
  validateSearch: z.object({
    digest: z
      .string()
      .regex(DIGEST_PUBLIC_ID_PATTERN)
      .optional()
      .catch(undefined),
    source: z
      .string()
      .regex(SOURCE_PUBLIC_ID_PATTERN)
      .optional()
      .catch(undefined),
  }),
});

// 열려 있는 초안 상세를 URL에 둔다 — 형식이 맞지만 존재하지 않는/삭제된
// sourcePublicId는(위 catch를 통과) 정상 파싱되어 그대로 통과하므로 여기서
// 안 걸러진다 — 그 죽은 링크는 SourceDetailPanel이 source.get의 NOT_FOUND를
// 받아 패널을 스스로 닫는 것으로 처리한다.
const draftsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "/drafts",
  component: DraftsPage,
  errorComponent: RouteErrorFallback,
  validateSearch: z.object({
    source: z
      .string()
      .regex(SOURCE_PUBLIC_ID_PATTERN)
      .optional()
      .catch(undefined),
  }),
});

const routeTree = rootRoute.addChildren([
  signinRoute,
  oauthConsentRoute,
  authenticatedRoute.addChildren([homeRoute, draftsRoute]),
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
