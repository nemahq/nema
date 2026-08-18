import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { resolveCorsOrigin } from "./infra/cors-origin";
import { initI18n } from "./infra/i18n";
import { getVectorStore } from "./infra/vector";
import { appRouter } from "./router";
import { createContext, onTRPCError } from "./trpc";

// find-my-way(Fastify 라우터)의 기본 maxParamLength(100)에 걸려, tRPC 배치 링크가
// 같은 프로시저를 여러 번 이어붙인 경로가 100자를 넘으면 라우트 자체가 안 잡혀 404가
// 난다 — 넉넉히 올려둔다.
const FASTIFY_MAX_PARAM_LENGTH = 5000;

// Fastify 기본값(1MB)과 같은 값이라 동작은 안 바뀐다 — 다만 그 기본값이 MCP
// (apps/mcp/src/index.ts)의 express.json 쪽 body limit과 실제로 일치해야 하는
// 값이라, 선언 안 된 프레임워크 기본값에만 기대는 채로 두지 않는다.
const FASTIFY_BODY_LIMIT_BYTES = 1024 * 1024;

loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

async function bootstrap() {
  await initI18n();
  await getVectorStore().ensureCollection();

  const server = Fastify({
    logger: true,
    bodyLimit: FASTIFY_BODY_LIMIT_BYTES,
    routerOptions: { maxParamLength: FASTIFY_MAX_PARAM_LENGTH },
  });
  const env = getEnv();

  await server.register(cors, {
    origin: resolveCorsOrigin(env.APP_ENV, env.CORS_ORIGIN),
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext, onError: onTRPCError },
  });

  server.get("/health", async () => ({ status: "ok", env: env.APP_ENV }));

  await server.listen({ port: env.PORT, host: "0.0.0.0" });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, async () => {
      server.log.info(`${signal} received, shutting down`);
      await server.close();
      process.exit(0);
    });
  }
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console -- fatal bootstrap before logger exists
  console.error("Fatal: bootstrap failed", err);
  process.exit(1);
});
