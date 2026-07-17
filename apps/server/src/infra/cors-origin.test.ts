import { describe, expect, it } from "vitest";

import { resolveCorsOrigin } from "./cors-origin";

// resolveCorsOrigin이 반환하는 함수를 콜백 스타일 그대로 부르면 테스트가 장황해져서,
// Promise로 감싸 await 가능한 형태로 좁혀 쓴다.
function checkOrigin(
  fn: ReturnType<typeof resolveCorsOrigin>,
  origin: string | undefined,
): Promise<boolean> {
  if (typeof fn === "string") {
    throw new Error("expected a function, got a string fallback");
  }
  return new Promise((resolve, reject) => {
    fn(origin, (err, allow) => (err ? reject(err) : resolve(allow)));
  });
}

describe("resolveCorsOrigin", () => {
  it("staging/production은 fallback 문자열을 그대로 돌려준다(동적 완화 없음)", () => {
    expect(resolveCorsOrigin("staging", "https://staging.getnema.app")).toBe(
      "https://staging.getnema.app",
    );
    expect(resolveCorsOrigin("production", "https://getnema.app")).toBe(
      "https://getnema.app",
    );
  });

  it("local: Origin 헤더가 없으면(브라우저 아닌 호출) 허용", async () => {
    const fn = resolveCorsOrigin("local", "http://localhost:5173");
    await expect(checkOrigin(fn, undefined)).resolves.toBe(true);
  });

  it("local: localhost/127.0.0.1은 포트 무관하게 허용", async () => {
    const fn = resolveCorsOrigin("local", "http://localhost:5173");
    await expect(checkOrigin(fn, "http://localhost:7788")).resolves.toBe(true);
    await expect(checkOrigin(fn, "http://127.0.0.1:9999")).resolves.toBe(true);
  });

  it("local: 실제 원격 origin은 거부(로컬 완화가 전체 개방이 아님)", async () => {
    const fn = resolveCorsOrigin("local", "http://localhost:5173");
    await expect(checkOrigin(fn, "https://staging.getnema.app")).resolves.toBe(
      false,
    );
  });

  it("local: localhost로 시작하지만 다른 호스트인 origin은 거부(접두사 매칭 우회 방지)", async () => {
    const fn = resolveCorsOrigin("local", "http://localhost:5173");
    await expect(
      checkOrigin(fn, "http://localhost.evil.com:5173"),
    ).resolves.toBe(false);
  });

  it("local: 파싱 불가능한 origin은 거부(throw 안 함)", async () => {
    const fn = resolveCorsOrigin("local", "http://localhost:5173");
    await expect(checkOrigin(fn, "not-a-url")).resolves.toBe(false);
  });
});
