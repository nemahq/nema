import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DigestReviewConfirmInputSchema } from "@nema-io/shared";

export function registerConfirmIngestionReview(server: McpServer): void {
  server.registerTool(
    "confirm_ingestion_review",
    {
      title: "Confirm ingestion review",
      description:
        "리뷰 대기 중인 Digest를 확정해 기억으로 들인다. 확정하면 nema가 진술로 쪼개고 기존 기억과 엮는다. 틀리면 revert_changeset으로 무를 수 있다.",
      inputSchema: DigestReviewConfirmInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result =
        await authedClient(extra).digestReview.confirm.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
