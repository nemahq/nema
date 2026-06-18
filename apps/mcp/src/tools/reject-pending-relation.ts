import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { RejectPendingRelationInputSchema } from "@nema-io/shared";

export function registerRejectPendingRelation(server: McpServer): void {
  server.registerTool(
    "reject_pending_relation",
    {
      title: "Reject pending relation",
      description:
        "보류된 관계 제안을 changesetId로 거부한다. 워커가 잘못 이은 관계라고 판정할 때 쓴다.",
      inputSchema: RejectPendingRelationInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        throw new Error("Authenticated access token is required");
      }
      await createNemaClient(token).changeset.rejectPendingRelation.mutate(
        input,
      );
      return { content: [{ type: "text", text: "Pending relation rejected" }] };
    },
  );
}
