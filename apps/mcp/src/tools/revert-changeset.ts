import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RevertChangesetInputSchema } from "@nema-io/shared";

export function registerRevertChangeset(server: McpServer): void {
  server.registerTool(
    "revert_changeset",
    {
      title: "Revert changeset",
      description:
        "변경 묶음 하나를 changesetId로 되돌린다. 틀린 확정을 무를 때 쓴다. 진술·관계까지 함께 되돌아간다.",
      inputSchema: RevertChangesetInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result = await authedClient(extra).changeset.revert.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
