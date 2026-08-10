import { describe, expect, it } from "vitest";

import { LlmError, resolveMaxRetries } from "./llm-error";

describe("resolveMaxRetries", () => {
  it("returns 1 for deterministic failures (auth)", () => {
    expect(resolveMaxRetries(new LlmError("auth", "bad key"), 5)).toBe(1);
  });

  it("returns 1 for deterministic failures (bad_request)", () => {
    expect(
      resolveMaxRetries(new LlmError("bad_request", "schema mismatch"), 5),
    ).toBe(1);
  });

  it("returns 1 for deterministic failures (content_filter)", () => {
    expect(
      resolveMaxRetries(new LlmError("content_filter", "blocked"), 5),
    ).toBe(1);
  });

  it("returns defaultMax for transient failures (timeout, rate_limit, unknown)", () => {
    expect(resolveMaxRetries(new LlmError("timeout", "slow"), 5)).toBe(5);
    expect(resolveMaxRetries(new LlmError("rate_limit", "429"), 5)).toBe(5);
    expect(resolveMaxRetries(new LlmError("unknown", "?"), 5)).toBe(5);
  });

  it("returns defaultMax for non-LlmError errors", () => {
    expect(resolveMaxRetries(new Error("db down"), 5)).toBe(5);
  });
});
