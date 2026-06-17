import { getEnv } from "@mcp/env";
import { createTRPCClient, httpLink } from "@trpc/client";

import type { AppRouter } from "@nema-io/server/src/router";

// 사용자 토큰을 그대로 실어 보낸다. 사용자/공간 해소와 검증은 apps/server의
// protectedProcedure + RLS가 담당한다(MCP는 인증 로직을 새로 짜지 않는다).
export function createNemaClient(accessToken: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${getEnv().NEMA_API_URL}/trpc`,
        headers: () => ({ Authorization: `Bearer ${accessToken}` }),
      }),
    ],
  });
}
