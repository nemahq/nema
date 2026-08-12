import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { resolveCorsOrigin } from "./infra/cors-origin";
import { initI18n } from "./infra/i18n";
import { appRouter } from "./router";
import { createContext, onTRPCError } from "./trpc";

// find-my-way(Fastify 라우터)의 기본 maxParamLength(100)에 걸려, tRPC 배치 링크가
// 같은 프로시저를 여러 번 이어붙인 경로가 100자를 넘으면 라우트 자체가 안 잡혀 404가
// 난다 — 넉넉히 올려둔다.
const FASTIFY_MAX_PARAM_LENGTH = 5000;

loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

async function bootstrap() {
  await initI18n();

  const server = Fastify({
    logger: true,
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
