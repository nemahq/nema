import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerListPendingRelations(server: McpServer): void {
  server.registerTool(
    "list_pending_relations",
    {
      title: "List pending relations",
      description:
        "잇기 워커가 확신하지 못해 보류해 둔 관계 제안 목록을 조회한다. apply_pending_relation 또는 reject_pending_relation에 넘길 changesetId를 여기서 얻는다.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, extra) => {
      const result =
        await authedClient(extra).changeset.listPendingRelations.query();
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
