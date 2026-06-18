import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ApplyPendingRelationInputSchema } from "@nema-io/shared";

export function registerApplyPendingRelation(server: McpServer): void {
  server.registerTool(
    "apply_pending_relation",
    {
      title: "Apply pending relation",
      description:
        "보류된 관계 제안을 changesetId로 승인해 관계를 세운다. 예를 들어 이 진술이 저 결정과 충돌한다거나 저 할 일을 해소한다고 판정할 때 쓴다.",
      inputSchema: ApplyPendingRelationInputSchema.shape,
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
      const result =
        await createNemaClient(token).changeset.applyPendingRelation.mutate(
          input,
        );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
