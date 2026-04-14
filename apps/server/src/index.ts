import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import * as Sentry from "@sentry/node";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { createSyncWorker } from "./infra/document-sync";
import { initI18n } from "./infra/i18n";
import { shutdown as shutdownPostHog } from "./infra/posthog";
import { getSupabaseAdmin } from "./infra/supabase";
import { createQdrantEntityStore, createQdrantStore } from "./infra/vector";
import { appRouter } from "./router";
import { failStaleSaveJobs } from "./services/save-job-service";
import { createContext } from "./trpc";

declare const __COMMIT_SHA__: string;
declare const __BUILD_TIMESTAMP__: string;

const COMMIT_SHA =
  typeof __COMMIT_SHA__ !== "undefined" ? __COMMIT_SHA__ : "dev";
const BUILD_TIMESTAMP =
  typeof __BUILD_TIMESTAMP__ !== "undefined" ? __BUILD_TIMESTAMP__ : "unknown";
const SENTRY_FLUSH_TIMEOUT_MS = 2000;

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

  Sentry.setupFastifyErrorHandler(server);

  server.get("/health", async () => ({
    status: "ok",
    env: env.APP_ENV,
    version: COMMIT_SHA,
    builtAt: BUILD_TIMESTAMP,
  }));

  const staleCount = await failStaleSaveJobs(getSupabaseAdmin());
  if (staleCount > 0) {
    server.log.info(`Marked ${staleCount} stale save jobs as failed`);
  }

  // Neo4j 스키마는 Qdrant 상태와 무관하게 항상 준비되어야 함 (entity.list 등 read 경로가 의존).
  const { createNeo4jStore } = await import("./infra/graph");
  const graphStore = createNeo4jStore();
  await graphStore.ensureSchema();
  server.log.info("Neo4j schema ready");

  let stopWorker: (() => Promise<void>) | undefined;

  if (
    env.QDRANT_URL &&
    env.QDRANT_API_KEY &&
    env.OPENAI_API_KEY &&
    env.VOYAGE_API_KEY
  ) {
    const vectorStore = createQdrantStore();
    await vectorStore.ensureCollection();
    server.log.info("Qdrant document collection ready");

    const entityVectorStore = createQdrantEntityStore();
    await entityVectorStore.ensureCollection();
    server.log.info("Qdrant entity collection ready");

    const { createVoyageProvider } = await import("./infra/embedding");

    const { getProviders } = await import("./infra/providers");

    const worker = createSyncWorker({
      supabase: getSupabaseAdmin(),
      llm: getProviders().llm.mini,
      embedding: createVoyageProvider({
        apiKey: env.VOYAGE_API_KEY,
      }),
      vectorStore,
      graphStore,
      entityVectorStore,
    });
    worker.start();
    stopWorker = worker.stop;
  } else {
    server.log.warn(
      "QDRANT_URL / QDRANT_API_KEY / OPENAI_API_KEY / VOYAGE_API_KEY not fully set, skipping worker init",
    );
  }

  await server.listen({ port: env.PORT, host: "0.0.0.0" });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, async () => {
      server.log.info(`${signal} received, shutting down`);
      try {
        await stopWorker?.();
      } catch (err) {
        server.log.error(`Worker stop failed: ${err}`);
      }
      await server.close();
      await shutdownPostHog();
      await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);
      process.exit(0);
    });
  }
}

bootstrap().catch(async (err) => {
  // eslint-disable-next-line no-console -- fatal bootstrap before logger exists
  console.error("Fatal: bootstrap failed", err);
  Sentry.captureException(err);
  await Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);
  process.exit(1);
});
