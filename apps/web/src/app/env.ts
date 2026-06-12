function validate(key: string): string {
  const envVar = import.meta.env[key];
  if (!envVar) {
    throw new Error(`${key}가 설정되지 않았습니다.`);
  }
  return envVar;
}

function optional(key: string): string | undefined {
  return import.meta.env[key] || undefined;
}

type AppEnv = "local" | "staging" | "production";

function resolveAppEnv(): AppEnv {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "local";
  }
  if (host.startsWith("staging.")) {
    return "staging";
  }
  return "production";
}

const env = {
  APP_ENV: resolveAppEnv(),
  API_URL: validate("VITE_API_URL"),
  SUPABASE_URL: validate("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: validate("VITE_SUPABASE_ANON_KEY"),
  TOLGEE_CDN_URL: optional("VITE_TOLGEE_CDN_URL"),
  POSTHOG_KEY: optional("VITE_POSTHOG_KEY"),
  POSTHOG_HOST: optional("VITE_POSTHOG_HOST"),
} as const;

export function getEnv() {
  return env;
}
