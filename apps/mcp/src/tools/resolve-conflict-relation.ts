import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ResolveConflictRelationInputSchema } from "@nema-io/shared";

export function registerResolveConflictRelation(server: McpServer): void {
  server.registerTool(
    "resolve_conflict_relation",
    {
      title: "Resolve conflict relation",
      description:
        "충돌(conflicts)로 보류된 관계 제안을 changesetId로 판정한다. winnerStatementId로 지정한 진술은 그대로 남고, 반대쪽 진술은 archive된다.",
      inputSchema: ResolveConflictRelationInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result =
        await authedClient(extra).changeset.resolveConflictRelation.mutate(
          input,
        );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
