import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvError, requireEnv } from "./env";

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

  it("throws EnvError when env var is whitespace only", () => {
    vi.stubEnv("WHITESPACE_VAR", "   ");
    expect(() => requireEnv("WHITESPACE_VAR")).toThrow(EnvError);
  });

  it("trims whitespace from env var value", () => {
    vi.stubEnv("PADDED_VAR", "  hello  ");
    expect(requireEnv("PADDED_VAR")).toBe("hello");
  });
});
