import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DraftEditInputSchema } from "@nema-io/shared";

export function registerEditDraft(server: McpServer): void {
  server.registerTool(
    "edit_draft",
    {
      title: "Edit draft",
      description:
        "이미 올린 대기 초안을 draftId로 지목해 부분 수정한다. 빠뜨린 필드는 기존값을 유지한다.",
      inputSchema: DraftEditInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      await authedClient(extra).draft.edit.mutate(input);
      return { content: [{ type: "text", text: "Draft updated" }] };
    },
  );
}
