import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DigestReviewUpdateInputSchema } from "@nema-io/shared";

export function registerUpdateIngestionReview(server: McpServer): void {
  server.registerTool(
    "update_ingestion_review",
    {
      title: "Update ingestion review",
      description:
        "리뷰 대기 중인 Digest 초안을 수정한다. 보낸 전체 상태로 통째로 교체하므로, 고칠 것만 담지 말고 유지할 Digest·레퍼런스까지 모두 담아 보낸다.",
      inputSchema: DigestReviewUpdateInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result =
        await authedClient(extra).digestReview.update.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
