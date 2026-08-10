import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { NarrationInputSchema } from "@nema-io/shared";

export function registerGetEvidence(server: McpServer): void {
  server.registerTool(
    "get_evidence",
    {
      title: "Get evidence",
      description:
        "줄기 범위에서 질의에 닿는 근거 진술 묶음(충돌·대체 표식과 진술별 sourceId 포함)을 조립해 돌려준다. 산문 합성은 호출한 LLM이 한다. 다시 켠 줄기의 맥락을 복원할 때 부른다.",
      inputSchema: NarrationInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const evidence =
        await authedClient(extra).narration.evidence.query(input);
      return {
        content: [{ type: "text", text: JSON.stringify(evidence) }],
        structuredContent: evidence,
      };
    },
  );
}
