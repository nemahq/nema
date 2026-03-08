import type { User } from "@supabase/supabase-js";
import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { resolveLanguage } from "./infra/i18n";
import { getSupabaseAdmin } from "./infra/supabase";

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const prefix = "Bearer ";
  const token = req.headers.authorization?.startsWith(prefix)
    ? req.headers.authorization.substring(prefix.length)
    : undefined;

  let user: User | null = null;
  if (token) {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (!error) {
      user = data.user;
    }
  }

  const acceptLanguage = req.headers["accept-language"];
  const lng = resolveLanguage(
    Array.isArray(acceptLanguage) ? acceptLanguage[0] : acceptLanguage,
  );

  return { req, res, log: req.log, user, lng };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});
