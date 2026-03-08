import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { initI18n } from "./infra/i18n";
import { createQdrantStore } from "./infra/vector";
import { appRouter } from "./router";
import { createContext } from "./trpc";

loadEnv(dirname(fileURLToPath(import.meta.url)) + "/..");

async function bootstrap() {
  await initI18n();
  const server = Fastify({ logger: true });
  const env = getEnv();

  await server.register(cors, {
    origin: env.CORS_ORIGIN,
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  server.get("/health", async () => ({ status: "ok" }));

  if (env.QDRANT_URL && env.QDRANT_API_KEY) {
    const vectorStore = createQdrantStore();
    await vectorStore.ensureCollection();
    server.log.info("Qdrant collection ready");
  } else {
    server.log.warn(
      "QDRANT_URL / QDRANT_API_KEY not set, skipping collection init",
    );
  }

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
  console.error("Fatal: bootstrap failed", err);
  process.exit(1);
});
