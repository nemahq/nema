import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTRPCClient, httpLink } from "@trpc/client";

import type { AppRouter } from "@nema-io/server/src/router";

import { getEnv } from "./env";

/**
 * 사용자 토큰을 그대로 실어 보낸다. 사용자/공간 해소와 검증은 apps/server의
 * protectedProcedure가 담당한다(MCP는 인증 로직을 새로 짜지 않는다).
 *
 * @lintignore 아직 이 클라이언트를 쓰는 도구가 없다 — 첫 도구가 서면 여기서 가져다 쓴다.
 */
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

// 도구는 아직 없다 — 새 도구 정의가 서기 전까지는 빈 MCP 서버로 전송 배선만 검증한다.
export function createMcpServer(): McpServer {
  return new McpServer({ name: "nema-mcp", version: "0.0.0" });
}
