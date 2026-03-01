import Fastify from "fastify";
import cors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { appRouter } from "./router.js";

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: process.env.CORS_ORIGIN || "http://localhost:5173",
});

await server.register(fastifyTRPCPlugin, {
  prefix: "/trpc",
  trpcOptions: { router: appRouter },
});

server.get("/health", async () => {
  return { status: "ok" };
});

const port = Number(process.env.PORT) || 3001;

server.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
