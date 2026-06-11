import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import * as Sentry from "@sentry/node";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";

import { getEnv, loadEnv } from "./env";
import { initI18n } from "./infra/i18n";
import { shutdown as shutdownPostHog } from "./infra/posthog";
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

  await server.listen({ port: env.PORT, host: "0.0.0.0" });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, async () => {
      server.log.info(`${signal} received, shutting down`);
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
