import {
  httpBatchStreamLink,
  httpSubscriptionLink,
  loggerLink,
  splitLink,
  TRPCClientError,
  type TRPCLink,
} from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { observable } from "@trpc/server/observable";

import type { AppRouter } from "@nema-io/server/src/router";

import { getEnv } from "@web/app/env";
import { getAccessToken, sessionReady, supabase } from "@web/lib/supabase";
import { tolgee } from "@web/lib/tolgee/client";

export const trpc = createTRPCReact<AppRouter>();

function getTrpcUrl() {
  return import.meta.env.DEV ? "/trpc" : `${getEnv().API_URL}/trpc`;
}

async function getHeaders() {
  await sessionReady;
  const headers: Record<string, string> = {};
  const token = getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const lang = tolgee.getLanguage();
  if (lang) {
    headers["Accept-Language"] = lang;
  }
  return headers;
}

let isRedirectingToSignIn = false;

export function isUnauthorizedError(
  error: unknown,
): error is TRPCClientError<AppRouter> {
  return (
    error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED"
  );
}

function triggerSignOutRedirect() {
  if (isRedirectingToSignIn) {
    return;
  }
  isRedirectingToSignIn = true;
  const redirect = window.location.pathname + window.location.search;
  supabase.auth.signOut().finally(() => {
    window.location.href = `/signin?redirect=${encodeURIComponent(redirect)}`;
  });
}

// access token 자동 갱신과 요청 타이밍이 겹치면 세션이 살아있어도 일시적으로
// UNAUTHORIZED가 날 수 있다 — 즉시 로그아웃하지 않고 세션을 재확인한 뒤에도
// 실패할 때만 로그아웃 처리한다.
function authRedirectLink(): TRPCLink<AppRouter> {
  return () =>
    ({ next, op }) =>
      observable((observer) => {
        let unsubscribed = false;
        let subscription = next(op).subscribe({
          next: (value) => observer.next(value),
          error: (error) => {
            // /signin에 이미 도착한 뒤 뒤늦게 도착한 요청이 UNAUTHORIZED를
            // 내는 경우, 여기서 또 리다이렉트를 걸면 이미 정상 진입한 로그인
            // 화면 위에 불필요한 하드 리로드가 한 번 더 겹친다.
            const alreadyOnSignIn =
              window.location.pathname.startsWith("/signin");
            if (
              isRedirectingToSignIn ||
              alreadyOnSignIn ||
              !isUnauthorizedError(error)
            ) {
              observer.error(error);
              return;
            }
            const reportRefreshFailure = () => {
              // refreshSession()이 정말로 죽은 세션을 확인해준 경우이므로,
              // 이 요청의 구독이 이미 취소됐더라도(예: 라우트 이동) 로그아웃은
              // 스킵하면 안 된다. observer 호출만 unsubscribed로 막는다.
              triggerSignOutRedirect();
              if (!unsubscribed) {
                observer.error(error);
              }
            };

            supabase.auth
              .refreshSession()
              .then(({ data, error: refreshError }) => {
                if (refreshError || !data.session) {
                  reportRefreshFailure();
                  return;
                }
                if (unsubscribed) {
                  return;
                }
                subscription = next(op).subscribe({
                  next: (value) => observer.next(value),
                  error: (retryError) => {
                    if (isUnauthorizedError(retryError)) {
                      triggerSignOutRedirect();
                    }
                    observer.error(retryError);
                  },
                  complete: () => observer.complete(),
                });
              })
              // refreshSession()은 lock 획득 실패(NavigatorLockAcquireTimeoutError 등)
              // 같은 이유로 {error} resolve가 아니라 reject될 수도 있다 — 못 잡으면
              // observer.error/complete가 영영 안 불려 요청이 pending에 멈춘다.
              .catch(reportRefreshFailure);
          },
          complete: () => observer.complete(),
        });

        return () => {
          unsubscribed = true;
          subscription.unsubscribe();
        };
      });
}

export const trpcClient = trpc.createClient({
  links: [
    loggerLink({
      enabled: (opts) =>
        import.meta.env.DEV ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    authRedirectLink(),
    splitLink({
      condition: (op) => op.type === "subscription",
      true: httpSubscriptionLink({
        url: getTrpcUrl(),
        connectionParams: async () => {
          await sessionReady;
          const token = getAccessToken();
          const lang = tolgee.getLanguage();
          return { ...(token && { token }), ...(lang && { lang }) };
        },
      }),
      false: httpBatchStreamLink({
        url: getTrpcUrl(),
        headers: getHeaders,
      }),
    }),
  ],
});
