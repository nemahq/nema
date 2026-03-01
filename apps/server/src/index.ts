import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router.js";
import { createContext } from "./trpc.js";

function getPort(): number {
  const raw = process.env.PORT;
  if (raw === undefined) return 3001;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`Invalid PORT: "${raw}"`);
  }
  return parsed;
}

async function bootstrap() {
  const server = Fastify({ logger: true });

  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
      onError({ error, path }: { error: Error; path: string | undefined }) {
        server.log.error({ err: error, path }, `tRPC error on ${path}`);
      },
    },
  });

  server.get("/health", async () => ({ status: "ok" }));

  const port = getPort();
  await server.listen({ port, host: "0.0.0.0" });

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
