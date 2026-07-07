import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DigestReviewGetInputSchema } from "@nema-io/shared";

export function registerGetIngestionReview(server: McpServer): void {
  server.registerTool(
    "get_ingestion_review",
    {
      title: "Get ingestion review",
      description:
        "리뷰 대기 중인 Digest 초안들을 changesetId로 펼쳐 조회한다. 원문과 나란히 놓고 확인·수정할 때 부른다.",
      inputSchema: DigestReviewGetInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result = await authedClient(extra).digestReview.get.query(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
