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

// fastifyTRPCPlugin의 trpcOptions.onError로 등록 — 미들웨어 try/catch와 달리
// procedure() 최상위(구독은 SSE formatError 경유)에서 실제로 호출되는 훅이다.
// 배치 요청(httpBatchStreamLink)은 실패한 호출마다 한 번씩이라 "요청당 한 번"은
// 아니다 — "각 프로시저 호출이 끝나는 지점마다"가 정확한 설명.
export function onTRPCError({ error }: { error: TRPCError }): void {
  const domainCode = getDomainCode(error.cause);
  if (domainCode) {
    // 정상적인 거부(권한·전제·대상 없음)는 장애가 아니라 캡처하지 않는다 — 노이즈 방지
    if (!isExpectedDomainError(error.cause)) {
      Sentry.captureException(error.cause, { tags: { domainCode } });
    }
    return;
  }

  // 여기까지 오면 cause가 우리 도메인 타입이 아니다 — 두 갈래가 섞여 있다:
  // ① 앱 코드가 직접 던진, cause 없는 TRPCError(UNAUTHORIZED·zod BAD_REQUEST 등).
  //    이 경우 개발자가 고른 code 자체가 "정상 거부"라는 의도 표시라 캡처 대상이
  //    아니다. ② tRPC가 원시 에러를 자동으로 감싼 것(항상 INTERNAL_SERVER_ERROR)
  //    이거나, 앱 코드가 의도적으로 INTERNAL_SERVER_ERROR로 던진 것(예:
  //    account-service의 계정 삭제 실패) — 둘 다 진짜 장애라 캡처해야 한다.
  //    code만으로 ①·②를 가르면 두 경우 모두 맞물린다: 자동 wrap과 의도적
  //    INTERNAL_SERVER_ERROR 던지기가 같은 code를 쓰기 때문.
  if (error.code !== "INTERNAL_SERVER_ERROR") {
    return;
  }
  Sentry.captureException(error.cause ?? error, {
    tags: { domainCode: "UNKNOWN" },
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
 * generator iteration 중 에러는 query·mutation의 procedure() 최상위 훅이 아니라
 * SSE 스트림 처리(sseStreamProducer)를 거치는데, 그 경로도 결국 등록된 onError를
 * 호출한다 — 여기서 또 Sentry.captureException을 하면 같은 에러가 두 번 잡힌다.
 * 캡처는 onTRPCError에 맡기고, 이 함수는 i18n 매핑 + 재시도 방지 코드 변환만 한다.
 * INTERNAL_SERVER_ERROR는 httpSubscriptionLink의 retryableRpcCodes에 포함되어 SSE
 * 자동 재연결 무한 루프를 유발하므로 UNPROCESSABLE_CONTENT로 변환한다.
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
