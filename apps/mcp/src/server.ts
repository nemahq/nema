import { registerApplyPendingRelation } from "@mcp/tools/apply-pending-relation";
import { registerArchiveStatement } from "@mcp/tools/archive-statement";
import { registerConfirmDraft } from "@mcp/tools/confirm-draft";
import { registerCreateDraft } from "@mcp/tools/create-draft";
import { registerEditDraft } from "@mcp/tools/edit-draft";
import { registerGetDraft } from "@mcp/tools/get-draft";
import { registerGetEvidence } from "@mcp/tools/get-evidence";
import { registerGetSource } from "@mcp/tools/get-source";
import { registerListChangesets } from "@mcp/tools/list-changesets";
import { registerListDrafts } from "@mcp/tools/list-drafts";
import { registerListPendingRelations } from "@mcp/tools/list-pending-relations";
import { registerListTopics } from "@mcp/tools/list-topics";
import { registerRejectPendingRelation } from "@mcp/tools/reject-pending-relation";
import { registerRevertChangeset } from "@mcp/tools/revert-changeset";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "nema-mcp", version: "0.0.0" });

  registerListTopics(server);
  registerGetEvidence(server);
  registerGetSource(server);

  registerCreateDraft(server);
  registerEditDraft(server);
  registerListDrafts(server);
  registerGetDraft(server);

  registerConfirmDraft(server);

  registerListChangesets(server);
  registerRevertChangeset(server);
  registerArchiveStatement(server);
  registerListPendingRelations(server);
  registerApplyPendingRelation(server);
  registerRejectPendingRelation(server);

  return server;
}
