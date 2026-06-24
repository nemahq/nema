import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { SourceGetInputSchema } from "@nema-io/shared";

export function registerGetSource(server: McpServer): void {
  server.registerTool(
    "get_source",
    {
      title: "Get source",
      description:
        "진술이 가리키는 원본 전문을 sourceId로 펼쳐 조회한다. get_evidence가 띄운 충돌·대체 표식을 원본까지 거슬러 직접 확인할 때 부른다.",
      inputSchema: SourceGetInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const source = await authedClient(extra).source.get.query(input);
      return {
        content: [{ type: "text", text: JSON.stringify(source) }],
        structuredContent: source,
      };
    },
  );
}
