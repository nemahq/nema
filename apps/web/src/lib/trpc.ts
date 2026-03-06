import { createTRPCClient, httpBatchLink, loggerLink } from "@trpc/client";
import type { AppRouter } from "@nema-io/server/src/router.js";

const apiUrl = import.meta.env.VITE_API_URL;

if (!apiUrl && import.meta.env.PROD) {
  throw new Error("VITE_API_URL이 설정되지 않았습니다.");
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    loggerLink({
      enabled: (opts) =>
        import.meta.env.DEV ||
        (opts.direction === "down" && opts.result instanceof Error),
    }),
    httpBatchLink({
      url: apiUrl ?? "http://localhost:4000/trpc",
    }),
  ],
});
