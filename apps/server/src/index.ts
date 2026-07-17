import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import * as Sentry from "@sentry/node";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { resolveCorsOrigin } from "./infra/cors-origin";
import { initI18n } from "./infra/i18n";
import { shutdown as shutdownPostHog } from "./infra/posthog";
import { createStatementSyncWorker } from "./infra/statement-sync";
import { getSupabaseAdmin } from "./infra/supabase";
import { createQdrantClient, createQdrantStore } from "./infra/vector";
import { appRouter } from "./router";
import { createContext, onTRPCError } from "./trpc";

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

  // 프로덕션 안전장치(tier 하드 lock·/dev 차단·preset/override 거부)가 전부 APP_ENV 하나에 걸려
  // 있어, 값이 어떻게 정해졌는지 부팅 때 남긴다. env var 없이 NODE_ENV로 추론됐으면 경고로 띄워
  // 오설정을 조기에 잡는다(잘못 추론되면 하드 lock 자체가 무경보로 뚫린다).
  if (process.env.APP_ENV) {
    server.log.info(`APP_ENV=${env.APP_ENV} (explicit)`);
  } else {
    const message = `APP_ENV not set — derived "${env.APP_ENV}" from NODE_ENV=${process.env.NODE_ENV ?? "unset"}. Production safety gates hinge on APP_ENV; set it explicitly.`;
    server.log.warn(message);
    Sentry.captureMessage(`[bootstrap] ${message}`, { level: "warning" });
  }

  await server.register(cors, {
    origin: resolveCorsOrigin(env.APP_ENV, env.CORS_ORIGIN),
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError: onTRPCError,
    },
  });

  Sentry.setupFastifyErrorHandler(server);

  server.get("/health", async () => ({
    status: "ok",
    env: env.APP_ENV,
    version: COMMIT_SHA,
    builtAt: BUILD_TIMESTAMP,
  }));

  // 스탬프가 빌드에 안 실리면 조용히 dev로 회귀한다 — 빌드 시점엔 감지할 환경
  // 신호가 없으므로(NEM-135) 배포 런타임(RAILWAY_ENVIRONMENT 존재)에서 잡는다.
  if (process.env.RAILWAY_ENVIRONMENT && COMMIT_SHA === "dev") {
    const message =
      'Deployed build has no commit SHA stamp — /health reports version "dev". CI must write .commit-sha before railway up.';
    server.log.error(message);
    Sentry.captureMessage(`[bootstrap] ${message}`, { level: "error" });
  }

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

    const { createVoyageProvider } = await import("./infra/embedding");
    const { getProviders } = await import("./infra/providers");

    const llmRouter = getProviders().llm;
    const worker = createStatementSyncWorker({
      supabase: getSupabaseAdmin(),
      // 추출·관계 판정 모델은 task 라우터가 고른다 — 기본은 둘 다 standard tier.
      // 티어 조정은 하니스에서 데이터 보고 (ingestion-design 3장).
      forTask: (task) => llmRouter.forTask(task),
      embedding: createVoyageProvider({ apiKey: env.VOYAGE_API_KEY }),
      vectorStore,
    });
    worker.start();
    stopWorker = worker.stop;
  } else {
    // 워커가 없으면 source가 박제만 되고 추출·임베딩이 영영 안 돈다 —
    // 배포 오설정이 "멀쩡해 보이는" 상태로 묻히지 않게 Sentry에도 남긴다.
    const message =
      "QDRANT_URL / QDRANT_API_KEY / OPENAI_API_KEY / VOYAGE_API_KEY not fully set, skipping statement-sync worker init";
    server.log.warn(message);
    Sentry.captureMessage(`[bootstrap] ${message}`, { level: "warning" });
  }

  await server.listen({ port: env.PORT, host: "0.0.0.0" });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, async () => {
      server.log.info(`${signal} received, shutting down`);
      try {
        await stopWorker?.();
      } catch (err) {
        server.log.error(`Worker stop failed: ${err}`);
        Sentry.captureException(err, { level: "warning" });
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
