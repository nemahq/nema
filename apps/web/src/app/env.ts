function validate(key: string): string {
  const envVar = import.meta.env[key];
  if (!envVar) {
    throw new Error(`${key}가 설정되지 않았습니다.`);
  }
  return envVar;
}

const env = {
  API_URL: validate("VITE_API_URL"),
} as const;

export function getEnv() {
  return env;
}
