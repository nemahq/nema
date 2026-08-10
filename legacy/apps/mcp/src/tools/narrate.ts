import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { NarrationInputSchema } from "@nema-io/shared";

export function registerNarrate(server: McpServer): void {
  server.registerTool(
    "narrate",
    {
      title: "Narrate",
      description:
        "질의에 닿는 근거 위에 nema 규율(결론 금지·문장마다 [s:id] 근거 마커·모르면 모른다)대로 산문 해설을 만들어 돌려준다. 산문 합성을 nema가 직접 수행해 앱 해설과 동일하다. 산문 없이 근거 묶음만 필요하면 get_evidence를 쓴다.",
      inputSchema: NarrationInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result =
        await authedClient(extra).narration.narrateText.query(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
