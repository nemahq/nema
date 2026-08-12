import { beforeEach, describe, expect, it, vi } from "vitest";

let providerEnv: "openai" | "vertex" = "openai";
let appEnv: "local" | "staging" | "production" = "staging";

vi.mock("@server/env", () => ({
  getEnv: () => ({
    DIGEST_GENERATION_LLM_PROVIDER: providerEnv,
    APP_ENV: appEnv,
  }),
}));

vi.mock("@server/infra/llm/openai-client", () => ({
  getOpenAiClient: () => ({}),
}));

vi.mock("@server/infra/llm/vertex-client", () => ({
  getGeminiClient: () => ({}),
}));

// 매 테스트마다 모듈을 새로 불러온다 — provider.ts·task-routing.ts 둘 다 모듈
// 스코프 상태(캐시·override 맵)를 갖고 있어, 리셋 없이는 테스트 순서에 결과가 갈린다.
describe("getDigestGenerationProvider", () => {
  beforeEach(() => {
    providerEnv = "openai";
    appEnv = "staging";
    vi.resetModules();
  });

  it("defaults to OpenAiProvider", async () => {
    const { getDigestGenerationProvider } =
      await import("@server/infra/llm/provider");
    const { OpenAiProvider } =
      await import("@server/infra/llm/openai-provider");

    expect(getDigestGenerationProvider()).toBeInstanceOf(OpenAiProvider);
  });

  it("routes to GeminiProvider when DIGEST_GENERATION_LLM_PROVIDER=vertex", async () => {
    providerEnv = "vertex";
    const { getDigestGenerationProvider } =
      await import("@server/infra/llm/provider");
    const { GeminiProvider } =
      await import("@server/infra/llm/gemini-provider");

    expect(getDigestGenerationProvider()).toBeInstanceOf(GeminiProvider);
  });

  it("caches the provider instance across calls", async () => {
    const { getDigestGenerationProvider } =
      await import("@server/infra/llm/provider");

    expect(getDigestGenerationProvider()).toBe(getDigestGenerationProvider());
  });

  it("throws when the vertex override is set in production", async () => {
    providerEnv = "vertex";
    appEnv = "production";
    const { getDigestGenerationProvider } =
      await import("@server/infra/llm/provider");

    expect(() => getDigestGenerationProvider()).toThrow(
      expect.objectContaining({ code: "bad_request" }),
    );
  });

  // seed 로직은 첫 호출 이후 건너뛴다(overrideSeeded) — 잠금 검사까지 건너뛰면
  // 첫 요청만 거부되고 그 다음 요청부터는 조용히 뚫린다. 두 번째 호출에서도
  // 여전히 막히는지로 그 회귀를 잡는다.
  it("keeps rejecting on every call, not just the first", async () => {
    providerEnv = "vertex";
    appEnv = "production";
    const { getDigestGenerationProvider } =
      await import("@server/infra/llm/provider");

    expect(() => getDigestGenerationProvider()).toThrow();
    expect(() => getDigestGenerationProvider()).toThrow();
  });

  it("does not block the default OpenAI path in production", async () => {
    appEnv = "production";
    const { getDigestGenerationProvider } =
      await import("@server/infra/llm/provider");
    const { OpenAiProvider } =
      await import("@server/infra/llm/openai-provider");

    expect(getDigestGenerationProvider()).toBeInstanceOf(OpenAiProvider);
  });
});
