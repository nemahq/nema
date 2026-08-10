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

    SUPABASE_URL: z.string().url(),
    SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    // 설정 시 Gemini를 Vertex(ADC 인증·GCP 크레딧) 경로로 — 없으면 GEMINI_API_KEY(AI Studio).
    GEMINI_VERTEX_PROJECT: z.string().min(1).optional(),
    GEMINI_VERTEX_LOCATION: z.string().min(1).optional(),
    // 헤드리스 배포엔 사람 로그인 ADC가 없어 서비스 계정 키로 명시 인증한다.
    GEMINI_VERTEX_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
    VOYAGE_API_KEY: z.string().min(1).optional(),

    QDRANT_URL: z.string().url().optional(),
    QDRANT_API_KEY: z.string().min(1).optional(),
    QDRANT_COLLECTION: z.string().min(1).default("statements"),

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
