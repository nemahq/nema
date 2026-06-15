import { beforeEach, describe, expect, it, vi } from "vitest";

// 클라이언트 생성자만 막아 실제 네트워크/키 검증을 차단한다 — 어댑터 클래스(Anthropic/
// GeminiProvider)는 진짜를 써야 forTask 결과를 instanceof로 검증할 수 있다.
vi.mock("openai", () => ({ default: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: vi.fn() }));
vi.mock("@qdrant/js-client-rest", () => ({ QdrantClient: vi.fn() }));
vi.mock("voyageai", () => ({ VoyageAIClient: vi.fn() }));

// getEnv를 테스트별로 바꿔 끼울 수 있게 가변 객체로 둔다.
type FakeEnv = Record<string, unknown>;
let fakeEnv: FakeEnv;
vi.mock("@server/env", () => ({
  getEnv: () => fakeEnv,
}));

function baseEnv(overrides: FakeEnv = {}): FakeEnv {
  return {
    APP_ENV: "staging",
    OPENAI_API_KEY: "sk-openai",
    VOYAGE_API_KEY: "voyage-key",
    QDRANT_URL: "http://localhost:6333",
    QDRANT_API_KEY: "qdrant-key",
    QDRANT_COLLECTION: "statements",
    ...overrides,
  };
}

// providers는 모듈 레벨 캐시(cached/공유 클라이언트)를 들고 있으므로 테스트마다 모듈을
// 새로 import한다. instanceof/LlmError 식별을 맞추려면 어댑터·에러 클래스도 같은
// 리셋 이후 그래프에서 동적 import해야 한다(정적 top-level import는 다른 인스턴스).
async function loadFresh() {
  vi.resetModules();
  const [providers, { AnthropicProvider }, { GeminiProvider }, { LlmError }] =
    await Promise.all([
      import("@server/infra/providers"),
      import("@server/infra/llm/anthropic-provider"),
      import("@server/infra/llm/gemini-provider"),
      import("@server/infra/llm/llm-error"),
    ]);
  return { ...providers, AnthropicProvider, GeminiProvider, LlmError };
}

describe("providers — override resolution wiring", () => {
  beforeEach(() => {
    fakeEnv = baseEnv();
  });

  it("resolves an anthropic catalog model to an AnthropicProvider", async () => {
    fakeEnv = baseEnv({ ANTHROPIC_API_KEY: "sk-anthropic" });
    const { getProviders, setTaskModel, AnthropicProvider } = await loadFresh();

    const providers = getProviders();
    setTaskModel("drafting", "claude-opus-4-8");

    expect(providers.llm.forTask("drafting")).toBeInstanceOf(AnthropicProvider);
  });

  it("resolves a google catalog model to a GeminiProvider", async () => {
    fakeEnv = baseEnv({ GEMINI_API_KEY: "gemini-key" });
    const { getProviders, setTaskModel, GeminiProvider } = await loadFresh();

    const providers = getProviders();
    setTaskModel("drafting", "gemini-2.5-pro");

    expect(providers.llm.forTask("drafting")).toBeInstanceOf(GeminiProvider);
  });

  it("throws auth when ANTHROPIC_API_KEY is missing for an anthropic model", async () => {
    // 키 없이도 서버는 뜨고, anthropic 모델이 실제로 요청될 때 끊겨야 한다.
    const { getProviders, setTaskModel, LlmError } = await loadFresh();
    getProviders();

    expect(
      causeCodeOf(() => setTaskModel("drafting", "claude-opus-4-8"), LlmError),
    ).toBe("auth");
  });

  it("throws auth when GEMINI_API_KEY is missing for a google model", async () => {
    const { getProviders, setTaskModel, LlmError } = await loadFresh();
    getProviders();

    expect(
      causeCodeOf(() => setTaskModel("drafting", "gemini-2.5-pro"), LlmError),
    ).toBe("auth");
  });
});

// setTaskModel은 resolve 실패를 bad_request로 감싸되 원인(auth)을 cause로 보존한다.
// 던진 에러의 cause를 instanceof로 좁혀(캐스팅 없이) code를 돌려준다 — 안 던지면 실패시킨다.
// LlmError 생성자는 리셋된 그래프에서 받아 와야 instanceof가 맞는다.
function causeCodeOf(
  run: () => void,
  LlmError: typeof import("@server/infra/llm/llm-error").LlmError,
): string {
  try {
    run();
  } catch (error) {
    if (error instanceof LlmError && error.cause instanceof LlmError) {
      return error.cause.code;
    }
    return "not-an-llm-error";
  }
  return "did-not-throw";
}
