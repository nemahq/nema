import { homedir } from "node:os";
import { resolve } from "node:path";

import { config } from "dotenv";
import { z } from "zod";

const appEnvValues = ["local", "staging", "production"] as const;

export type AppEnv = (typeof appEnvValues)[number];

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    APP_ENV: z.enum(appEnvValues).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
  })
  .transform((data) => ({
    ...data,
    APP_ENV:
      data.APP_ENV ??
      (data.NODE_ENV === "production" ? "production" : "staging"),
  }));

type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(appRoot: string): void {
  const appEnv = process.env.APP_ENV ?? "staging";
  config({ path: resolve(appRoot, `.env.${appEnv}`) });
  config({ path: resolve(appRoot, ".env") });
  config({ path: resolve(homedir(), ".config/nema/.env.secret") });

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }
  env = result.data;
}

export function getEnv(): Env {
  if (!env) {
    throw new Error("loadEnv() must be called before getEnv()");
  }
  return env;
}
