import { accountRouter } from "@server/routers/account-router";
import { digestRouter } from "@server/routers/digest-router";
import { profileRouter } from "@server/routers/profile-router";
import { sourceRouter } from "@server/routers/source-router";
import { router } from "@server/trpc";

export const appRouter = router({
  account: accountRouter,
  digest: digestRouter,
  profile: profileRouter,
  source: sourceRouter,
});

// apps/web·apps/mcp가 tRPC 클라이언트 타입 연결에 이 타입을 가져다 쓴다.
export type AppRouter = typeof appRouter;
