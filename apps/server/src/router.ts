import { router } from "./trpc";

// 도메인 라우터는 아직 없다 — 새 스키마(다이제스트·진술·관계)가 서기 전까지는
// 빈 루트 라우터로 tRPC 배선만 검증한다.
export const appRouter = router({});

/**
 * @lintignore 프론트엔드 end-to-end 타입 연결용 — apps/web이 legacy로 옮겨가 있는 동안은
 * 참조하는 곳이 없다.
 */
export type AppRouter = typeof appRouter;
