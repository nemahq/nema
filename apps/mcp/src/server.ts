import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createTRPCClient, httpLink, isTRPCClientError } from "@trpc/client";

import type { AppRouter } from "@nema-io/server/src/router";
import {
  DigestActionInputSchema,
  DigestSearchInputSchema,
  MCP_CLIENT_HEADER_NAME,
  MCP_CLIENT_HEADER_VALUE,
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
        headers: () => ({
          Authorization: `Bearer ${accessToken}`,
          [MCP_CLIENT_HEADER_NAME]: MCP_CLIENT_HEADER_VALUE,
        }),
      }),
    ],
  });
}

function toolResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

// SDK가 콜백에서 던진 값을 잡아 isError 결과로 바꿔주긴 하지만 message만 쓴다
// (mcp.js executeToolHandler). tRPC 에러의 code(예: NOT_FOUND, UNAUTHORIZED)는
// message에 안 실리므로, 여기서 직접 앞에 붙여야 Claude가 재시도 가능 여부를
// 문장 해석 없이 code만 보고 판단할 수 있다.
function toolError(error: unknown): CallToolResult {
  if (isTRPCClientError(error)) {
    const code = error.data?.code ?? "UNKNOWN";
    return {
      content: [{ type: "text", text: `[${code}] ${error.message}` }],
      isError: true,
    };
  }
  return {
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
    isError: true,
  };
}

// 도구 셋: 던지기(source.ingest)·꺼내기(digest.search)·관계 따라가기
// (digest.getRelations)·다이제스트 보기(digest.get)·원문 보기(source.get).
// 꺼내기 응답에는 관계를 안 싣는다 — 결과 10개마다 관계가 딸려 오면 응답이 폭발하고,
// 자동으로 오면 "관계를 실제로 따라가나"가 로그에 안 남는다(원문 보기와 같은 원칙).
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
      try {
        return toolResult(await client.source.ingest.mutate({ body }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "search_digests",
    {
      title: "다이제스트 꺼내기",
      description:
        "질의와 뜻이 가까운 다이제스트를 찾아 그대로 돌려준다. 다이제스트를 해석하거나 요약하지 않는다 — 그건 이 도구를 부르는 쪽의 몫이다.",
      // limit은 tRPC 스키마엔 있지만(하니스·디버깅용) 도구에는 안 연다 — 호출마다
      // 개수가 달라지면 "결과 몇 개가 쓸모 있었나"를 호출끼리 비교할 근거가 없어진다.
      inputSchema: { query: DigestSearchInputSchema.shape.query },
    },
    async ({ query }) => {
      try {
        return toolResult(await client.digest.search.query({ query }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_relations",
    {
      title: "연결 따라가기",
      description:
        "이 다이제스트가 무엇을 지지하거나 약화하는지, 또 무엇에게 지지받거나 약화되는지 연결을 가져온다. 사용자가 어떤 판단의 근거나 그 판단이 흔들리는 이유를 물을 때 쓴다. 상대 다이제스트는 제목·유형까지만 온다 — 내용이 필요하면 get_digest로 간다.",
      inputSchema: DigestActionInputSchema.shape,
    },
    async ({ digestId }) => {
      try {
        return toolResult(await client.digest.getRelations.query({ digestId }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "get_digest",
    {
      title: "다이제스트 보기",
      description:
        "digestId로 다이제스트 하나를 전부 가져온다. 꺼내기나 연결에서 제목만 받은 것을 펼쳐 볼 때 쓴다.",
      inputSchema: DigestActionInputSchema.shape,
    },
    async ({ digestId }) => {
      try {
        return toolResult(await client.digest.get.query({ digestId }));
      } catch (error) {
        return toolError(error);
      }
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
      try {
        return toolResult(await client.source.get.query({ sourceId }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
