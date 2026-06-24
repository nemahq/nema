import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DraftAssistInputSchema } from "@nema-io/shared";

export function registerAssistDraft(server: McpServer): void {
  server.registerTool(
    "assist_draft",
    {
      title: "Assist draft",
      description:
        "거친 입력을 nema 규율로 정제해 제목·주제 제안과 함께 새 대기 초안으로 올린다. 정제는 nema가 직접 수행해 앱 입구와 같은 결과를 낸다(제목·정제 본문·기존 주제 재사용). 확정 전 대기 자리에 머물 뿐 아직 기억으로 들어가지 않으며, 확정은 confirm_draft로 사람이 따로 명령한다.",
      inputSchema: DraftAssistInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result = await authedClient(extra).draft.assist.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
