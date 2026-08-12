import { beforeEach, describe, expect, it, vi } from "vitest";

let providerEnv: "openai" | "vertex" = "openai";

vi.mock("@server/env", () => ({
  getEnv: () => ({ DIGEST_GENERATION_LLM_PROVIDER: providerEnv }),
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
});
