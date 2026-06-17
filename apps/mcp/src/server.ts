import { registerListTopics } from "@mcp/tools/list-topics";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: "nema-mcp", version: "0.0.0" });
  registerListTopics(server);
  return server;
}
