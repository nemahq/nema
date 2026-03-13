import * as Sentry from "@sentry/node";
import type { User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { getDomainCode, mapDomainError } from "./error-mapper";
import { resolveLanguage } from "./infra/i18n";
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

  const acceptLanguage = req.headers["accept-language"];
  const lng = resolveLanguage(
    Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage,
  );

  return { req, res, log: req.log, user, lng, supabase };
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
