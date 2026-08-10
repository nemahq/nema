import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import {
  createSupabaseTokenVerifier,
  protectedResourceMetadata,
} from "@mcp/auth";
import { getEnv, loadEnv } from "@mcp/env";
import { createMcpServer } from "@mcp/server";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const PRM_PATH = "/.well-known/oauth-protected-resource";

loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

function main(): void {
  const env = getEnv();
  const resourceMetadataUrl = new URL(`${PRM_PATH}/mcp`, env.MCP_PUBLIC_URL)
    .href;

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const metadata = protectedResourceMetadata();
  for (const path of [PRM_PATH, `${PRM_PATH}/mcp`]) {
    app.get(path, (_req, res) => {
      res.json(metadata);
    });
  }

  const bearerAuth = requireBearerAuth({
    verifier: createSupabaseTokenVerifier(),
    resourceMetadataUrl,
  });

  // stateless: 요청마다 새 transport/server를 연결해 요청 ID 충돌을 막는다.
  app.post("/mcp", bearerAuth, async (req, res) => {
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
