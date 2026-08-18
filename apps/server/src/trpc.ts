import { ZodError } from "zod";
import type { User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import {
  MCP_CLIENT_HEADER_NAME,
  MCP_CLIENT_HEADER_VALUE,
} from "@nema-io/shared";

import {
  getDomainCode,
  isExpectedDomainError,
  mapDomainError,
} from "@server/error-mapper";
import { resolveLanguage, t as translate } from "@server/infra/i18n";
import { captureException } from "@server/infra/monitoring";
import {
  createSupabaseUser,
  getSupabaseAdmin,
} from "@server/infra/supabase/supabase";
import type { RequestOrigin } from "@server/request-origin";

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const prefix = "Bearer ";
  const token = req.headers.authorization?.startsWith(prefix)
    ? req.headers.authorization.substring(prefix.length)
    : undefined;

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

  const lng = resolveLanguage(req.headers["accept-language"]);
  const origin: RequestOrigin =
    req.headers[MCP_CLIENT_HEADER_NAME] === MCP_CLIENT_HEADER_VALUE
      ? "mcp"
      : "web";

  return { req, res, log: req.log, user, lng, supabase, origin };
}

type Context = Awaited<ReturnType<typeof createContext>>;

// tRPC 입력 파서가 ZodError를 그대로 TRPCError.message에 실어보낸다 — errorFormatter가
// 개입하기 전이라 도메인 에러 매핑망을 안 탄다. 여기서 안 막으면 화면에 원문 zod
// issue 배열(영문 JSON)이 그대로 노출된다.
function isZodInputError(cause: unknown): boolean {
  return cause instanceof ZodError;
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error, ctx }) {
    const lng = ctx?.lng ?? "ko";
    if (isZodInputError(error.cause)) {
      return {
        ...shape,
        message: translate("error.default", { lng }),
        data: { ...shape.data, domainCode: undefined },
      };
    }

    const domainCode = getDomainCode(error.cause);
    if (!domainCode) {
      return { ...shape, data: { ...shape.data, domainCode } };
    }

    const mapped = mapDomainError(error.cause, lng);
    return {
      ...shape,
      message: mapped.message,
      data: { ...shape.data, code: mapped.code, domainCode },
    };
  },
});

export const router = t.router;

// fastifyTRPCPlugin의 trpcOptions.onError로 등록한다(index.ts) — 응답 shape 확정
// (errorFormatter, 위)과 별개로, 요청이 끝나는 지점마다 부수효과(로깅·Sentry 전송)를
// 맡는다. 정상적인 거부(권한·대상 없음)는 장애가 아니라 어느 쪽에도 안 남긴다 —
// 노이즈 방지. Sentry는 production에서만 켜지므로(infra/monitoring.ts) staging에선 로그만
// 남는다.
export function onTRPCError({
  error,
  req,
}: {
  error: TRPCError;
  req?: { log: { error: (obj: Record<string, unknown>, msg: string) => void } };
}): void {
  const domainCode = getDomainCode(error.cause);
  if (domainCode) {
    if (!isExpectedDomainError(error.cause)) {
      req?.log.error({ err: error.cause, domainCode }, "trpc domain error");
      captureException(error.cause, { tags: { domainCode } });
    }
    return;
  }

  if (error.code !== "INTERNAL_SERVER_ERROR") {
    return;
  }
  req?.log.error({ err: error.cause ?? error }, "trpc internal error");
  captureException(error.cause ?? error, {
    tags: { domainCode: "UNKNOWN" },
  });
}

/**
 * @lintignore 아직 이걸 쓰는 라우터가 없다 — 새 도메인 라우터가 서면 여기서 가져다 쓴다.
 */
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
