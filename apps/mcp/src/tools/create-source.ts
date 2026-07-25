import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SourceCreateInputSchema } from "@nema-io/shared";

export function registerCreateSource(server: McpServer): void {
  server.registerTool(
    "create_source",
    {
      title: "Create source",
      description:
        "외부에서 굴린 결론이나 원문을 원문으로 던져 넣는다. nema가 이를 Digest 후보로 정리하고, 사람이 리뷰·확정해야 기억으로 들어간다. 다듬지 말고 있는 그대로 넣어라 — 정리는 nema가 한다.",
      inputSchema: SourceCreateInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result = await authedClient(extra).source.create.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
