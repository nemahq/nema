import type { User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import {
  createSupabaseUser,
  getSupabaseAdmin,
} from "@server/infra/supabase/supabase";

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

  return { req, res, log: req.log, user, supabase };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;

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
