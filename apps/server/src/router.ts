import { router } from "./trpc";

// 도메인 라우터는 아직 없다 — 새 스키마(다이제스트·진술·관계)가 서기 전까지는
// 빈 루트 라우터로 tRPC 배선만 검증한다.
export const appRouter = router({});

// apps/web·apps/mcp가 tRPC 클라이언트 타입 연결에 이 타입을 가져다 쓴다.
export type AppRouter = typeof appRouter;
