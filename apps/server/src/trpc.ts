import { initTRPC } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res, log: req.log };
}

type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create();

export const router = t.router;

/**
 * @lintignore 아직 이걸 쓰는 라우터가 없다 — 새 도메인 라우터가 서면 여기서 가져다 쓴다.
 */
export const publicProcedure = t.procedure;
