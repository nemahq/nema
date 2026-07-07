import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerListPendingSources(server: McpServer): void {
  server.registerTool(
    "list_pending_sources",
    {
      title: "List pending sources",
      description:
        "아직 그래프에 들어가지 않은 대기 원본을 조회한다. reviewChangesetId가 있으면 Digest 리뷰가 열린 것(get_ingestion_review로 펼침), 없으면 아직 정리 중이다.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, extra) => {
      const result = await authedClient(extra).source.listPending.query();
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
