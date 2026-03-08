function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value) throw new Error(`${key}가 설정되지 않았습니다.`);
  return value;
}

export const ENV = {
  API_URL: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
  SUPABASE_URL: requireEnv("VITE_SUPABASE_URL"),
  SUPABASE_ANON_KEY: requireEnv("VITE_SUPABASE_ANON_KEY"),
} as const;
