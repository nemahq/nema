import * as Sentry from "@sentry/node";
import type { User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";

import type { Locale } from "@nema-io/shared";

import {
  getDomainCode,
  isExpectedDomainError,
  mapDomainError,
} from "./error-mapper";
import { resolveLanguage } from "./infra/i18n";
import type { Providers } from "./infra/providers";
import { getProviders } from "./infra/providers";
import { createSupabaseUser, getSupabaseAdmin } from "./infra/supabase";

export async function createContext({
  req,
  res,
  info,
}: CreateFastifyContextOptions) {
  const prefix = "Bearer ";
  // SSE subscription은 connectionParams로 토큰을 전달받음
  const token = req.headers.authorization?.startsWith(prefix)
    ? req.headers.authorization.substring(prefix.length)
    : (info.connectionParams?.["token"] ?? undefined);

  let user: User | null = null;
  let supabase: ReturnType<typeof createSupabaseUser> | null = null;
  if (token) {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (!error) {
      user = data.user;
      supabase = createSupabaseUser(token);
    } else {
      req.log.warn({ err: error }, "auth.getUser failed");
    }
  }

  // SSE는 커스텀 헤더를 지원하지 않아 connectionParams로 언어 전달
  const langParam =
    (info.connectionParams?.["lang"] as string | undefined) ??
    req.headers["accept-language"];
  const lng = resolveLanguage(langParam);

  let providers: Providers | null = null;
  try {
    providers = getProviders();
  } catch (err) {
    const isConfigMissing =
      err instanceof Error && /required for chat/.test(err.message);
    if (!isConfigMissing) {
      req.log.warn({ err }, "getProviders() failed unexpectedly");
      Sentry.captureException(err, {
        tags: { component: "trpc-context" },
      });
    }
  }

  return { req, res, log: req.log, user, lng, supabase, providers };
}

type Context = Awaited<ReturnType<typeof createContext>>;

// resolver·미들웨어가 던진 에러는 tRPC 내부 callRecursive가 미들웨어 next() 호출마다
// {ok:false, error} 반환값으로 흡수한다 — 실제 JS throw는 그 값을 최종적으로
// 언랩하는 procedure() 최상위 호출부에서만 일어난다. 그래서 t.middleware()의
// try/catch(next() 호출을 감싸는 형태)는 자기 코드 자신이 던지는 게 아닌 한 절대
// 아무것도 못 잡는다 — 이게 예전 errorHandlingMiddleware가 죽은 코드였던 이유
// (space-management 슬라이스 작업 중 발견: FE 매핑용 도메인 코드는 errorFormatter가
// 살려놔서 우연히 새지 않았을 뿐, 번역된 메시지·정확한 HTTP 코드·Sentry 캡처는
// 전부 안 타고 있었다).
// 그래서 요청 하나가 끝나는 지점에서 항상 호출되는 두 훅으로 옮긴다:
// errorFormatter(응답 shape 확정, 아래) + onTRPCError(부수효과, index.ts에서
// fastifyTRPCPlugin의 onError로 등록).
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error, ctx }) {
    const domainCode = getDomainCode(error.cause);
    if (!domainCode) {
      return { ...shape, data: { ...shape.data, domainCode } };
    }

    const mapped = mapDomainError(error.cause, ctx?.lng ?? "ko");
    return {
      ...shape,
      message: mapped.message,
      data: {
        ...shape.data,
        code: mapped.code,
        httpStatus: getHTTPStatusCodeFromError(mapped),
        domainCode,
      },
    };
  },
});

export const router = t.router;

// fastifyTRPCPlugin의 trpcOptions.onError로 등록 — 요청당 정확히 한 번, 항상 불린다
// (미들웨어 try/catch와 달리 procedure() 최상위에서 호출되는 진짜 훅).
export function onTRPCError({ error }: { error: TRPCError }): void {
  const domainCode = getDomainCode(error.cause);
  // 정상적인 거부(권한·전제·대상 없음)는 장애가 아니라 캡처하지 않는다 — 노이즈 방지
  if (domainCode && isExpectedDomainError(error.cause)) {
    return;
  }
  Sentry.captureException(error.cause ?? error, {
    tags: { domainCode: domainCode ?? "UNKNOWN" },
  });
}

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user || !ctx.supabase) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user, supabase: ctx.supabase } });
});

/**
 * Subscription(async generator) 내부 에러를 잡아 i18n 매핑 + 비재시도 코드로 변환.
 * query·mutation은 errorFormatter+onTRPCError가 처리하지만, 그 경로는 procedure()
 * 최상위 호출부에서만 발동해 generator iteration 중 에러는 못 잡는다 — 여기서 직접
 * try/catch로 잡아야 한다. INTERNAL_SERVER_ERROR는 httpSubscriptionLink의
 * retryableRpcCodes에 포함되어 SSE 자동 재연결 무한 루프를 유발하므로
 * UNPROCESSABLE_CONTENT로 변환한다.
 */
export async function* mapSubscriptionErrors<T>(
  gen: AsyncGenerator<T>,
  lng: Locale,
): AsyncGenerator<T> {
  try {
    return yield* gen;
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    Sentry.captureException(error, {
      tags: { domainCode: getDomainCode(error) ?? "UNKNOWN" },
    });
    const mapped = mapDomainError(error, lng);
    throw new TRPCError({
      code:
        mapped.code === "INTERNAL_SERVER_ERROR"
          ? "UNPROCESSABLE_CONTENT"
          : mapped.code,
      message: mapped.message,
      cause: error,
    });
  }
}

export const providerProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.providers) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "AI providers not configured.",
    });
  }
  return next({ ctx: { ...ctx, providers: ctx.providers } });
});
