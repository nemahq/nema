import { afterEach, describe, expect, it, vi } from "vitest";

import { getEnv, loadEnv } from "./env";

vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

describe("loadEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses valid env vars", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

    loadEnv("/fake/root");
    const env = getEnv();

    expect(env.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
  });

  it("throws on missing required vars", () => {
    // SUPABASE_ANON_KEY 등 누락
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");

    expect(() => loadEnv("/fake/root")).toThrow(
      "Invalid environment variables",
    );
  });

  it("throws on invalid SUPABASE_URL format", () => {
    vi.stubEnv("SUPABASE_URL", "not-a-url");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");

    expect(() => loadEnv("/fake/root")).toThrow(
      "Invalid environment variables",
    );
  });
});
