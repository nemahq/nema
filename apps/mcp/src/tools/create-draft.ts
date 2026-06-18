import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { DraftCreateInputSchema } from "@nema-io/shared";

// origin은 외부 입구 고정값이라 도구로 노출하지 않고 호출 때 'external'로 채운다.
const CreateDraftInputSchema = DraftCreateInputSchema.omit({ origin: true });

export function registerCreateDraft(server: McpServer): void {
  server.registerTool(
    "create_draft",
    {
      title: "Create draft",
      description:
        "외부에서 굴린 결론을 새 대기 초안으로 올린다. 확정 전 대기 자리에 머물 뿐 아직 기억으로 들어가지 않는다. 확정은 confirm_draft로 사람이 따로 명령해야 한다.",
      inputSchema: CreateDraftInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        throw new Error("Authenticated access token is required");
      }
      const result = await createNemaClient(token).draft.create.mutate({
        origin: "external",
        ...input,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
}
