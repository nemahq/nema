import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createTRPCClient, httpLink } from "@trpc/client";

import type { AppRouter } from "@nema-io/server/src/router";
import {
  DigestSearchInputSchema,
  SourceActionInputSchema,
  SourceIngestInputSchema,
} from "@nema-io/shared";

import { getEnv } from "./env";

/**
 * 사용자 토큰을 그대로 실어 보낸다. 사용자/공간 해소와 검증은 apps/server의
 * protectedProcedure가 담당한다(MCP는 인증 로직을 새로 짜지 않는다).
 */
function createNemaClient(accessToken: string) {
  return createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: `${getEnv().NEMA_API_URL}/trpc`,
        headers: () => ({ Authorization: `Bearer ${accessToken}` }),
      }),
    ],
  });
}

// 도구 셋: 던지기(source.ingest)·꺼내기(digest.search)·원문 보기(source.get).
// 요청마다 새 서버를 연결하는 stateless 구조(index.ts)라 accessToken을 그때그때
// 받아 그 요청 전용 tRPC 클라이언트를 만든다.
export function createMcpServer(accessToken: string): McpServer {
  const server = new McpServer({ name: "nema-mcp", version: "0.0.0" });
  const client = createNemaClient(accessToken);

  server.registerTool(
    "ingest_source",
    {
      title: "원문 던지기",
      description:
        "원문을 Nema에 던진다. 원문을 사람이 읽기 좋게 정리한 다이제스트로 만들어 저장하고, 나중에 뜻으로 찾아 꺼낼 수 있게 색인한다.",
      inputSchema: SourceIngestInputSchema.shape,
    },
    async ({ body }) => {
      const result = await client.source.ingest.mutate({ body });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "search_digests",
    {
      title: "다이제스트 꺼내기",
      description:
        "질의와 뜻이 가까운 다이제스트를 찾아 그대로 돌려준다. 다이제스트를 해석하거나 요약하지 않는다 — 그건 이 도구를 부르는 쪽의 몫이다.",
      inputSchema: DigestSearchInputSchema.shape,
    },
    async ({ query, limit }) => {
      const result = await client.digest.search.query({ query, limit });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  server.registerTool(
    "get_source",
    {
      title: "원문 보기",
      description:
        "다이제스트가 부실하거나 더 자세히 봐야 할 때만 부른다. sourceId로 정리 전 원문 전체를 가져온다.",
      inputSchema: SourceActionInputSchema.shape,
    },
    async ({ sourceId }) => {
      const result = await client.source.get.query({ sourceId });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  );

  return server;
}
