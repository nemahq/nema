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
    vi.stubEnv("NEO4J_URI", "bolt://localhost:7687");
    vi.stubEnv("NEO4J_USERNAME", "neo4j");
    vi.stubEnv("NEO4J_PASSWORD", "password");

    loadEnv("/fake/root");
    const env = getEnv();

    expect(env.SUPABASE_URL).toBe("https://test.supabase.co");
    expect(env.PORT).toBe(3001);
    expect(env.CORS_ORIGIN).toBe("http://localhost:5173");
  });

  it("throws on missing required vars", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    // NEO4J_URI 누락

    expect(() => loadEnv("/fake/root")).toThrow(
      "Invalid environment variables",
    );
  });

  it("throws on invalid SUPABASE_URL format", () => {
    vi.stubEnv("SUPABASE_URL", "not-a-url");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEO4J_URI", "bolt://localhost:7687");
    vi.stubEnv("NEO4J_USERNAME", "neo4j");
    vi.stubEnv("NEO4J_PASSWORD", "password");

    expect(() => loadEnv("/fake/root")).toThrow(
      "Invalid environment variables",
    );
  });

  it("accepts optional QDRANT vars", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEO4J_URI", "bolt://localhost:7687");
    vi.stubEnv("NEO4J_USERNAME", "neo4j");
    vi.stubEnv("NEO4J_PASSWORD", "password");

    loadEnv("/fake/root");
    const env = getEnv();

    expect(env.QDRANT_URL).toBeUndefined();
    expect(env.QDRANT_API_KEY).toBeUndefined();
  });

  it("throws when only one QDRANT var is set", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    vi.stubEnv("NEO4J_URI", "bolt://localhost:7687");
    vi.stubEnv("NEO4J_USERNAME", "neo4j");
    vi.stubEnv("NEO4J_PASSWORD", "password");
    vi.stubEnv("QDRANT_URL", "http://localhost:6333");

    expect(() => loadEnv("/fake/root")).toThrow(
      "QDRANT_URL and QDRANT_API_KEY must both be set or both be omitted",
    );
  });
});
