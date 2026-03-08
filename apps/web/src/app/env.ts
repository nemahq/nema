function validate(key: string): string {
  const value = import.meta.env[key];
  if (!value) throw new Error(`${key}가 설정되지 않았습니다.`);
  return value;
}

const env = {
  API_URL: validate("VITE_API_URL"),
  SUPABASE_URL: validate("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: validate("VITE_SUPABASE_ANON_KEY"),
} as const;

export function getEnv() {
  return env;
}
