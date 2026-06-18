import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ArchiveStatementInputSchema } from "@nema-io/shared";

export function registerArchiveStatement(server: McpServer): void {
  server.registerTool(
    "archive_statement",
    {
      title: "Archive statement",
      description:
        "진술 하나를 statementId로 빼서 가린다. 지우는 게 아니라 시야에서 접는다. 충돌에서 진 쪽을 닫을 때도 이걸 쓴다.",
      inputSchema: ArchiveStatementInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input, extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        throw new Error("Authenticated access token is required");
      }
      await createNemaClient(token).changeset.archiveStatement.mutate(input);
      return { content: [{ type: "text", text: "Statement archived" }] };
    },
  );
}
