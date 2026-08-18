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
      title: "Capture Source",
      description:
        "Save a source into Nema. It is split into digests, indexed for meaning-based search, and linked to related digests already stored. Use when the content carries a judgment worth keeping — a decision and its reasoning, an open question, a learning, an idea, or an assumption. Skip routine chatter with no judgment in it.",
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
      title: "Search Digests",
      description:
        "Find digests semantically close to a query. Use when the user asks about past judgments — what was decided, why, what was learned, what is still open. Returns digests as stored, without interpretation. Does not include connections; call Get Connections for those.",
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
      title: "Get Connections",
      description:
        "Get how a digest connects to others — what supports or weakens it, and what it duplicates or conflicts with. Use when the user asks why a judgment was made, what backs it, or whether anything contradicts it. Counterparts come back with title and type only; call Get Digest for the full content.",
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
      title: "Get Digest",
      description:
        "Get one digest in full by digestId. Use to expand something that came back as a title only from Search Digests or Get Connections.",
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
      title: "Get Source",
      description:
        "Get the original, unprocessed source text by sourceId. Use only when a digest is too thin or the raw wording matters — digests are the normal way to read what was captured.",
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
