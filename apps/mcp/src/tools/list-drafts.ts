import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerListDrafts(server: McpServer): void {
  server.registerTool(
    "list_drafts",
    {
      title: "List drafts",
      description:
        "확정 전 대기 중인 초안 목록을 조회한다. 방금 올린 초안을 확인하거나 edit_draft로 수정할 기존 초안의 draftId를 찾을 때 부른다.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        throw new Error("Authenticated access token is required");
      }
      const result = await createNemaClient(token).draft.list.query();
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
