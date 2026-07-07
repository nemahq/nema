import { registerApplyPendingRelation } from "@mcp/tools/apply-pending-relation";
import { registerArchiveStatement } from "@mcp/tools/archive-statement";
import { registerConfirmIngestionReview } from "@mcp/tools/confirm-ingestion-review";
import { registerCreateSource } from "@mcp/tools/create-source";
import { registerGetEvidence } from "@mcp/tools/get-evidence";
import { registerGetIngestionReview } from "@mcp/tools/get-ingestion-review";
import { registerGetSource } from "@mcp/tools/get-source";
import { registerListChangesets } from "@mcp/tools/list-changesets";
import { registerListPendingRelations } from "@mcp/tools/list-pending-relations";
import { registerListPendingSources } from "@mcp/tools/list-pending-sources";
import { registerListTopics } from "@mcp/tools/list-topics";
import { registerNarrate } from "@mcp/tools/narrate";
import { registerRejectPendingRelation } from "@mcp/tools/reject-pending-relation";
import { registerRevertChangeset } from "@mcp/tools/revert-changeset";
import { registerUpdateIngestionReview } from "@mcp/tools/update-ingestion-review";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "nema-mcp", version: "0.0.0" });

  registerListTopics(server);
  registerGetEvidence(server);
  registerNarrate(server);
  registerGetSource(server);

  // 넣기: 원문 박제 → Digest 리뷰(확인·수정·확정). 확정은 revert로 무를 수 있어 MCP도 뚫는다.
  registerCreateSource(server);
  registerListPendingSources(server);
  registerGetIngestionReview(server);
  registerUpdateIngestionReview(server);
  registerConfirmIngestionReview(server);

  registerListChangesets(server);
  registerRevertChangeset(server);
  registerArchiveStatement(server);
  registerListPendingRelations(server);
  registerApplyPendingRelation(server);
  registerRejectPendingRelation(server);

  return server;
}
