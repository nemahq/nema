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

  Sentry.setupFastifyErrorHandler(server);

  server.get("/health", async () => ({ status: "ok" }));

  let stopWorker: (() => Promise<void>) | undefined;

  if (env.QDRANT_URL && env.QDRANT_API_KEY) {
    const vectorStore = createQdrantStore();
    await vectorStore.ensureCollection();
    server.log.info("Qdrant collection ready");

    const { createVoyageProvider } = await import("./infra/embedding");
    const { createNeo4jStore } = await import("./infra/graph");

    const { OpenAiProvider } = await import("./infra/llm/openai-provider");

    const worker = createSyncWorker({
      supabase: getSupabaseAdmin(),
      llm: new OpenAiProvider({ apiKey: env.OPENAI_API_KEY as string }),
      embedding: createVoyageProvider({
        apiKey: env.VOYAGE_API_KEY as string,
      }),
      vectorStore,
      graphStore: createNeo4jStore(),
    });
    worker.start();
    stopWorker = worker.stop;
  } else {
    server.log.warn(
      "QDRANT_URL / QDRANT_API_KEY not set, skipping collection init",
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
      await Sentry.flush(2000);
      process.exit(0);
    });
  }
}

bootstrap().catch(async (err) => {
  console.error("Fatal: bootstrap failed", err);
  Sentry.captureException(err);
  await Sentry.flush(2000);
  process.exit(1);
});
