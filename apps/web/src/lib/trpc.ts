import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";

import type { AppRouter } from "@nema-io/server/src/router";

import { getEnv } from "@web/app/env";

export const trpc = createTRPCReact<AppRouter>();

function getTrpcUrl() {
  return import.meta.env.DEV ? "/trpc" : `${getEnv().API_URL}/trpc`;
}

export const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: getTrpcUrl() })],
});
