import * as Sentry from "@sentry/node";
import type { User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import type { Locale } from "@nema-io/shared";

import { getDomainCode, mapDomainError } from "./error-mapper";
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

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    const domainCode = getDomainCode(error.cause);
    return {
      ...shape,
      data: {
        ...shape.data,
        domainCode,
      },
    };
  },
});

export const router = t.router;

const errorHandlingMiddleware = t.middleware(async ({ ctx, next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof TRPCError) {
      throw error;
    }
    Sentry.captureException(error, {
      tags: { domainCode: getDomainCode(error) ?? "UNKNOWN" },
    });
    throw mapDomainError(error, ctx.lng);
  }
});

export const publicProcedure = t.procedure.use(errorHandlingMiddleware);

export const protectedProcedure = t.procedure
  .use(errorHandlingMiddleware)
  .use(({ ctx, next }) => {
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
 * tRPC의 errorHandlingMiddleware는 generator iteration 중 에러를 못 잡고,
 * INTERNAL_SERVER_ERROR는 httpSubscriptionLink의 retryableRpcCodes에 포함되어
 * SSE 자동 재연결 무한 루프를 유발하므로 UNPROCESSABLE_CONTENT로 변환한다.
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
