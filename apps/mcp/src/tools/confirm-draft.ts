import { authedClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DraftConfirmInputSchema } from "@nema-io/shared";

export function registerConfirmDraft(server: McpServer): void {
  server.registerTool(
    "confirm_draft",
    {
      title: "Confirm draft",
      description:
        "대기 초안을 확정해 기억으로 들인다. 확정하면 nema가 진술로 쪼개고 기존 기억과 엮는다. 사람이 직접 확정을 명령했을 때만 부른다. 사람 지시 없이 create_draft 뒤에 이어서 자동으로 부르지 않는다. 틀리면 revert_changeset으로 무를 수 있다.",
      inputSchema: DraftConfirmInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const result = await authedClient(extra).draft.confirm.mutate(input);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
