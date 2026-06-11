import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import * as Sentry from "@sentry/node";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { initI18n } from "./infra/i18n";
import { shutdown as shutdownPostHog } from "./infra/posthog";
import { createStatementSyncWorker } from "./infra/statement-sync";
import { getSupabaseAdmin } from "./infra/supabase";
import { createQdrantClient, createQdrantStore } from "./infra/vector";
import { appRouter } from "./router";
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

  let stopWorker: (() => Promise<void>) | undefined;

  if (
    env.QDRANT_URL &&
    env.QDRANT_API_KEY &&
    env.OPENAI_API_KEY &&
    env.VOYAGE_API_KEY
  ) {
    const vectorStore = createQdrantStore(createQdrantClient());
    await vectorStore.ensureCollection();
    server.log.info("Qdrant statement collection ready");

    // v1 컬렉션(documents·entities)은 합성 문서 모델과 함께 데이터째 폐기
    const dropped = await vectorStore.dropLegacyCollections();
    if (dropped.length > 0) {
      server.log.info(
        `Dropped legacy Qdrant collections: ${dropped.join(", ")}`,
      );
    }

    const { createVoyageProvider } = await import("./infra/embedding");
    const { getProviders } = await import("./infra/providers");

    const worker = createStatementSyncWorker({
      supabase: getSupabaseAdmin(),
      // 절단 품질이 첫 출시 품질을 좌우 — 티어 조정은 하니스에서 데이터 보고 (ingestion-design 3장)
      llm: getProviders().llm.standard,
      embedding: createVoyageProvider({ apiKey: env.VOYAGE_API_KEY }),
      vectorStore,
    });
    worker.start();
    stopWorker = worker.stop;
  } else {
    server.log.warn(
      "QDRANT_URL / QDRANT_API_KEY / OPENAI_API_KEY / VOYAGE_API_KEY not fully set, skipping statement-sync worker init",
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
