import { describe, it, expect, vi, afterEach } from "vitest";
import { requireEnv, EnvError } from "./env.js";

describe("requireEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns value when env var is set", () => {
    vi.stubEnv("TEST_VAR", "hello");
    expect(requireEnv("TEST_VAR")).toBe("hello");
  });

  it("throws EnvError when env var is missing", () => {
    delete process.env.NONEXISTENT_VAR;
    expect(() => requireEnv("NONEXISTENT_VAR")).toThrow(EnvError);
  });

  it("throws EnvError when env var is empty string", () => {
    vi.stubEnv("EMPTY_VAR", "");
    expect(() => requireEnv("EMPTY_VAR")).toThrow(EnvError);
  });
});
