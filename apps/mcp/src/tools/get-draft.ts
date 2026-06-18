import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DraftGetInputSchema } from "@nema-io/shared";

export function registerGetDraft(server: McpServer): void {
  server.registerTool(
    "get_draft",
    {
      title: "Get draft",
      description: "대기 초안 하나의 전문을 draftId로 조회한다.",
      inputSchema: DraftGetInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        throw new Error("Authenticated access token is required");
      }
      const draft = await createNemaClient(token).draft.get.query(input);
      return {
        content: [{ type: "text", text: JSON.stringify(draft) }],
        structuredContent: draft,
      };
    },
  );
}
