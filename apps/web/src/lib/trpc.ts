import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@nema-io/server/src/router.js";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: import.meta.env.VITE_API_URL ?? "http://localhost:4000/trpc",
    }),
  ],
});
