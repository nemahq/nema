import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ResolveDuplicateRelationInputSchema } from "@nema-io/shared";

export function registerResolveDuplicateRelation(server: McpServer): void {
  server.registerTool(
    "resolve_duplicate_relation",
    {
      title: "Resolve duplicate relation",
      description:
        "중복(duplicates)으로 보류된 관계 제안을 changesetId로 병합 확정한다. mergedDigest에 담긴 제목·본문 등으로 새 Digest를 만들고, 기존 두 Digest는 archive된다.",
      inputSchema: ResolveDuplicateRelationInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result =
        await authedClient(extra).changeset.resolveDuplicateRelation.mutate(
          input,
        );
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
