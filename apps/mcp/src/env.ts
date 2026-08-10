import { resolve } from "node:path";

import { config } from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  NEMA_API_URL: z.string().url().default("https://api-staging.getnema.app"),
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
