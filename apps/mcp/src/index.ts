import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { createSupabaseTokenVerifier, protectedResourceMetadata } from "./auth";
import { FAVICON_PATH, getEnv, loadEnv } from "./env";
import { createMcpServer } from "./server";

const PRM_PATH = "/.well-known/oauth-protected-resource";

// body-parser 기본 limit(100KB)에 걸려 SOURCE_BODY_MAX_LENGTH(100,000자)가
// 실제로는 한글(글자당 최대 3바이트, UTF-8) 3만 자쯤부터 413으로 끊겼다 —
// 스키마 상한이 통과시키는 입력은 이 계층에서도 통과해야 한다. 한글로 꽉 채우면
// 최대 약 300KB, 여기에 JSON-RPC 봉투와 줄바꿈 등 제어문자 이스케이프 오버헤드를
// 더해도 넉넉한 값으로 서버(apps/server) Fastify의 기본 body limit(1MB)에
// 맞춘다 — 두 계층의 실제 허용치를 일치시킨다.
const JSON_BODY_LIMIT_BYTES = 1024 * 1024;

loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

function main(): void {
  const env = getEnv();
  const resourceMetadataUrl = new URL(`${PRM_PATH}/mcp`, env.MCP_PUBLIC_URL)
    .href;

  const app = express();
  app.use(express.json({ limit: JSON_BODY_LIMIT_BYTES }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // 커넥터 아이콘을 favicon에서 찾는 클라이언트가 있어 웹앱 자산으로 넘긴다
  // (serverInfo.icons만 읽는 클라이언트는 server.ts 쪽이 채운다).
  app.get(FAVICON_PATH, (_req, res) => {
    res.redirect(302, new URL(FAVICON_PATH, env.NEMA_WEB_URL).href);
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
    // bearerAuth를 통과했으면 req.auth.token은 항상 있다 — 없으면 미들웨어가
    // 먼저 401로 끊었을 것이다.
    const accessToken = req.auth?.token;
    if (!accessToken) {
      res.status(401).json({ error: "Missing access token" });
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
    });
    await createMcpServer(accessToken).connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  app.listen(env.PORT, () => {
    console.log(
      `nema MCP server listening on http://localhost:${env.PORT}/mcp`,
    );
  });
}

main();
