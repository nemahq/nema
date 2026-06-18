import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ListChangesetsInputSchema } from "@nema-io/shared";

export function registerListChangesets(server: McpServer): void {
  server.registerTool(
    "list_changesets",
    {
      title: "List changesets",
      description:
        "되돌릴 수 있는 변경 묶음 이력을 조회한다. revert_changeset에 넘길 changesetId를 여기서 얻는다.",
      inputSchema: ListChangesetsInputSchema.shape,
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
      const result =
        await createNemaClient(token).changeset.listChangesets.query(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
