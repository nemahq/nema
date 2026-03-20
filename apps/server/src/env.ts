import { homedir } from "node:os";
import { resolve } from "node:path";

import { config } from "dotenv";
import { z } from "zod";

const appEnvValues = ["local", "staging", "production"] as const;

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    APP_ENV: z.enum(appEnvValues).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    CORS_ORIGIN: z.string().default("http://localhost:5173"),

    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    OPENAI_API_KEY: z.string().min(1).optional(),
    VOYAGE_API_KEY: z.string().min(1).optional(),

    QDRANT_URL: z.string().url().optional(),
    QDRANT_API_KEY: z.string().min(1).optional(),

    NEO4J_URI: z.string().min(1),
    NEO4J_USERNAME: z.string().min(1),
    NEO4J_PASSWORD: z.string().min(1),

    LLM_MODEL_STANDARD: z.string().min(1).optional(),
    LLM_MODEL_MINI: z.string().min(1).optional(),
    LLM_MODEL_NANO: z.string().min(1).optional(),

    POSTHOG_API_KEY: z.string().min(1).optional(),
    POSTHOG_HOST: z.string().url().optional(),
  })
  .refine(
    (data) =>
      (data.QDRANT_URL && data.QDRANT_API_KEY) ||
      (!data.QDRANT_URL && !data.QDRANT_API_KEY),
    {
      message:
        "QDRANT_URL and QDRANT_API_KEY must both be set or both be omitted",
    },
  )
  .transform((data) => ({
    ...data,
    APP_ENV:
      data.APP_ENV ?? (data.NODE_ENV === "production" ? "production" : "local"),
  }));

type Env = z.infer<typeof envSchema>;

let env: Env;

export function loadEnv(appRoot: string): void {
  config({ path: resolve(appRoot, ".env") });
  config({ path: resolve(homedir(), ".config/nema/server.env") });

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
