import { z } from "zod";
import { createNemaClient } from "@mcp/trpc-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { TopicSchema } from "@nema-io/shared";

// 새 도구를 더할 때 따를 형태: 입력 스키마는 @nema-io/shared 재사용,
// 본문은 대응 tRPC 프로시저 호출 한 줄, 결과 반환.
export function registerListTopics(server: McpServer): void {
  server.registerTool(
    "list_topics",
    {
      title: "List topics",
      description:
        "사용자의 기존 주제 목록을 조회한다. 초안을 올리기 전에 기존 주제를 재사용하려고 먼저 읽는다.",
      inputSchema: {},
      outputSchema: { topics: z.array(TopicSchema) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (_args, extra) => {
      const token = extra.authInfo?.token;
      if (!token) {
        throw new Error("Authenticated access token is required");
      }
      const { topics } = await createNemaClient(token).topic.list.query();
      const payload = { topics };
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
}
