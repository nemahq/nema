import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { getEnv, loadEnv } from "./env";
import { createMcpServer } from "./server";

loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

function main(): void {
  const env = getEnv();
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // stateless: 요청마다 새 transport/server를 연결해 요청 ID 충돌을 막는다.
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
    });
    await createMcpServer().connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(env.PORT, () => {
    console.log(
      `nema MCP server listening on http://localhost:${env.PORT}/mcp`,
    );
  });
}

main();
