import { resolve } from "node:path";

import { config } from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  NEMA_API_URL: z.string().url().default("https://api-staging.getnema.app"),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  // 이 MCP 서버 자신의 공개 URL. OAuth에서 보호 자원(resource) 식별자로 쓰인다.
  MCP_PUBLIC_URL: z.string().url().default("http://localhost:3002/mcp"),
  // 토큰을 발급하는 Supabase OAuth 서버 issuer. 미설정 시 SUPABASE_URL에서 파생한다.
  SUPABASE_OAUTH_ISSUER: z.string().url().optional(),
});

type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function loadEnv(appRoot: string): void {
  const appEnv = process.env.APP_ENV ?? "staging";
  config({ path: resolve(appRoot, `.env.${appEnv}`) });
  config({ path: resolve(appRoot, ".env") });

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

export function getOAuthIssuer(): string {
  const current = getEnv();
  return current.SUPABASE_OAUTH_ISSUER ?? `${current.SUPABASE_URL}/auth/v1`;
}
