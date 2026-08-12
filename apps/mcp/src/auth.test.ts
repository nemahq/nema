import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseTokenVerifier } from "./auth";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("./env", () => ({
  getEnv: () => ({
    SUPABASE_URL: "https://proj.supabase.co",
    SUPABASE_ANON_KEY: "anon-key",
    MCP_PUBLIC_URL: "http://localhost:3002/mcp",
  }),
  getOAuthIssuer: () => "https://proj.supabase.co/auth/v1",
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));

function jwtWithExp(exp: number): string {
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "u1", exp })}.sig`;
}

describe("createSupabaseTokenVerifier", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  // requireBearerAuth가 expiresAt(숫자)를 요구하므로, 유효 토큰이 401로 떨어지지
  // 않으려면 verifier가 exp를 채워야 한다(이 회귀를 막는 테스트).
  it("유효 토큰이면 JWT exp를 expiresAt로 채운다", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const exp = 1893456000;

    const info = await createSupabaseTokenVerifier().verifyAccessToken(
      jwtWithExp(exp),
    );

    expect(info.expiresAt).toBe(exp);
  });

  it("Supabase가 토큰을 거부하면 InvalidTokenError를 던진다", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    });

    await expect(
      createSupabaseTokenVerifier().verifyAccessToken(jwtWithExp(1893456000)),
    ).rejects.toThrow();
  });
});
