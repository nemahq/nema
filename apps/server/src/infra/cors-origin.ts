import type { AppEnv } from "@server/env";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

type OriginCallback = (err: Error | null, allow: boolean) => void;
type OriginFunction = (origin: string | undefined, cb: OriginCallback) => void;

// 로컬(APP_ENV=local)에서만 포트 무관하게 localhost/127.0.0.1을 전부 허용한다 — 워크트리
// 여러 개를 동시에 띄우며 그때그때 다른 포트를 쓰는 로컬 개발 패턴이 CORS_ORIGIN 문자열
// 하나만 허용하던 기존 설정과 안 맞아, 기본 포트(5173)가 아니면 API 호출이 전부 막히는
// 문제가 있었다. staging/production은 지금처럼 fallback(env.CORS_ORIGIN) 하나만 엄격히
// 허용 — 이 완화는 로컬에만 적용된다.
export function resolveCorsOrigin(
  appEnv: AppEnv,
  fallback: string,
): string | OriginFunction {
  if (appEnv !== "local") {
    return fallback;
  }

  return (origin, cb) => {
    // 브라우저가 아닌 호출(서버 간 통신, curl 등)엔 Origin 헤더가 없다 — CORS는 브라우저가
    // 강제하는 정책이라 여기선 막을 이유가 없다(@fastify/cors 기본 동작과 동일).
    if (!origin) {
      cb(null, true);
      return;
    }

    // 문자열 접두사 매칭(origin.startsWith("http://localhost"))은 쓰지 않는다 —
    // http://localhost.evil.com 같은 origin도 통과시키는 known bypass라, URL을 파싱해
    // hostname을 정확히 비교한다.
    let hostname: string;
    try {
      hostname = new URL(origin).hostname;
    } catch {
      cb(null, false);
      return;
    }
    cb(null, LOCAL_HOSTNAMES.has(hostname));
  };
}
