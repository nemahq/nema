import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@nema-io/server/src/router.js";

export type { AppRouter };
export const trpc = createTRPCReact<AppRouter>();
