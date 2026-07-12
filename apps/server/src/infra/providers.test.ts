import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// 클라이언트 생성자만 막아 실제 네트워크/키 검증을 차단한다 — 어댑터 클래스(Anthropic/
// GeminiProvider)는 진짜를 써야 forTask 결과를 instanceof로 검증할 수 있다.
// OpenAI 클라이언트는 responses 스파이를 노출해 forTask가 바인딩 effort를 어댑터로
// 흘리는지(bindEffort 주입)까지 관찰한다.
const { openaiResponsesParse, openaiResponsesCreate } = vi.hoisted(() => ({
  openaiResponsesParse: vi.fn(),
  openaiResponsesCreate: vi.fn(),
}));
vi.mock("openai", () => ({
  default: vi.fn(() => ({
    responses: { parse: openaiResponsesParse, create: openaiResponsesCreate },
  })),
}));
vi.mock("@anthropic-ai/sdk", () => ({ default: vi.fn() }));
vi.mock("@google/genai", () => ({ GoogleGenAI: vi.fn() }));
vi.mock("@qdrant/js-client-rest", () => ({ QdrantClient: vi.fn() }));
vi.mock("voyageai", () => ({ VoyageAIClient: vi.fn() }));
// 부트 점검(auditSeededOverrides)이 폴백 시 Sentry로 경고한다 — 실제 SDK 호출을 막는다.
vi.mock("@sentry/node", () => ({ captureMessage: vi.fn() }));

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
  const [
    providers,
    { AnthropicProvider },
    { GeminiProvider },
    { OpenAiProvider },
    { LlmError },
    { setTaskOverride },
  ] = await Promise.all([
    import("@server/infra/providers"),
    import("@server/infra/llm/anthropic-provider"),
    import("@server/infra/llm/gemini-provider"),
    import("@server/infra/llm/openai-provider"),
    import("@server/infra/llm/llm-error"),
    import("@server/infra/llm/task-routing"),
  ]);
  return {
    ...providers,
    AnthropicProvider,
    GeminiProvider,
    OpenAiProvider,
    LlmError,
    setTaskOverride,
  };
}

describe("providers — override resolution wiring", () => {
  beforeEach(() => {
    fakeEnv = baseEnv();
  });

  it("resolves an anthropic catalog model to an AnthropicProvider", async () => {
    fakeEnv = baseEnv({ ANTHROPIC_API_KEY: "sk-anthropic" });
    const { getProviders, setTaskModel, AnthropicProvider } = await loadFresh();

    const providers = getProviders();
    setTaskModel({ task: "generateDraft", modelId: "claude-opus-4-8" });

    expect(providers.llm.forTask("generateDraft")).toBeInstanceOf(
      AnthropicProvider,
    );
  });

  it("resolves a google catalog model to a GeminiProvider", async () => {
    fakeEnv = baseEnv({ GEMINI_API_KEY: "gemini-key" });
    const { getProviders, setTaskModel, GeminiProvider } = await loadFresh();

    const providers = getProviders();
    setTaskModel({ task: "generateDraft", modelId: "gemini-3.1-pro-preview" });

    expect(providers.llm.forTask("generateDraft")).toBeInstanceOf(
      GeminiProvider,
    );
  });

  it("throws auth when ANTHROPIC_API_KEY is missing for an anthropic model", async () => {
    // 키 없이도 서버는 뜨고, anthropic 모델이 실제로 요청될 때 끊겨야 한다.
    const { getProviders, setTaskModel, LlmError } = await loadFresh();
    getProviders();

    expect(
      causeCodeOf(
        () =>
          setTaskModel({ task: "generateDraft", modelId: "claude-opus-4-8" }),
        LlmError,
      ),
    ).toBe("auth");
  });

  it("throws auth when GEMINI_API_KEY is missing for a google model", async () => {
    const { getProviders, setTaskModel, LlmError } = await loadFresh();
    getProviders();

    expect(
      causeCodeOf(
        () =>
          setTaskModel({
            task: "generateDraft",
            modelId: "gemini-3.1-pro-preview",
          }),
        LlmError,
      ),
    ).toBe("auth");
  });
});

describe("forTask — override 키 부재 가드", () => {
  beforeEach(() => {
    fakeEnv = baseEnv();
  });

  it("falls back to the tier default when an override's provider key is missing", async () => {
    const { getProviders, setTaskOverride, GeminiProvider } = await loadFresh();
    const providers = getProviders();
    // setTaskOverride는 setTaskModel과 달리 키를 검증하지 않는다 — 키 없는 override 상태를 만들어
    // forTask 가드가 이를 버리고 tier 기본으로 폴백하는지 본다(키 부재 환경 안전장치).
    setTaskOverride({ task: "narrate", modelId: "gemini-3.1-flash-lite" });
    expect(providers.llm.forTask("narrate")).not.toBeInstanceOf(GeminiProvider);
    // 같은 폴백을 겪는 generateDraft(둘 다 override 없이 tier 기본)와 동일 인스턴스다.
    expect(providers.llm.forTask("narrate")).toBe(
      providers.llm.forTask("generateDraft"),
    );
  });

  it("does not leak one task's override onto an untouched task", async () => {
    fakeEnv = baseEnv({
      GEMINI_API_KEY: "gemini-key",
      ANTHROPIC_API_KEY: "sk-anthropic",
    });
    const { getProviders, setTaskModel, AnthropicProvider } = await loadFresh();
    const providers = getProviders();
    setTaskModel({ task: "classifyDraftIntent", modelId: "claude-opus-4-8" });
    // generateSessionTitle은 override 없음 → 다른 task의 override로 새지 않고 tier 기본을 탄다.
    expect(providers.llm.forTask("generateSessionTitle")).not.toBeInstanceOf(
      AnthropicProvider,
    );
  });
});

describe("tier 기본값 — 비프로덕션 프로바이더 무관화 (Layer 1)", () => {
  beforeEach(() => {
    fakeEnv = baseEnv();
  });

  it("resolves non-prod tier defaults to Google when the Google key is present", async () => {
    fakeEnv = baseEnv({ GEMINI_API_KEY: "gemini-key" });
    const { getProviders, GeminiProvider } = await loadFresh();
    // 시드·override·effort 없는 task → all-nano로 nano tier(Google 기본값)를 그대로 탄다.
    expect(getProviders().llm.forTask("generateSessionTitle")).toBeInstanceOf(
      GeminiProvider,
    );
  });

  it("falls back non-prod tier defaults to committed OpenAI when the Google key is absent", async () => {
    const { getProviders, GeminiProvider, OpenAiProvider } = await loadFresh();
    // Google 키 부재 → nano tier가 gpt-5-nano(OpenAI)로 폴백해 부팅이 그대로 뜬다.
    const provider = getProviders().llm.forTask("generateSessionTitle");
    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider).not.toBeInstanceOf(GeminiProvider);
  });

  it("reports the fallback in getLlmPreset when the Google key is absent", async () => {
    const { getProviders, getLlmPreset } = await loadFresh();
    getProviders();
    // 폴백된 실제 tier 모델이 그대로 보여 dev 패널이 진짜 resolve 결과를 읽는다.
    expect(getLlmPreset().models.nano).toBe("gpt-5-nano");
  });

  it("falls a bogus LLM_MODEL_* value (uncatalogued) back to the committed OpenAI default", async () => {
    // 카탈로그에 없는 모델 문자열 분기 — 오타/폐기된 id를 env에 넣어도 부팅이 안 깨지고 gpt-5로 떨어진다.
    fakeEnv = baseEnv({ LLM_MODEL_NANO: "totally-not-a-real-model" });
    const { getProviders, getLlmPreset } = await loadFresh();
    getProviders();
    expect(getLlmPreset().models.nano).toBe("gpt-5-nano");
  });
});

describe("프로덕션 하드 lock — tier 프로바이더 스왑 무시", () => {
  it("ignores LLM_MODEL_* env and forces committed OpenAI tier defaults", async () => {
    fakeEnv = baseEnv({
      APP_ENV: "production",
      GEMINI_API_KEY: "gemini-key",
      LLM_MODEL_STANDARD: "gemini-3.1-pro-preview",
      LLM_MODEL_MINI: "gemini-3.1-flash-lite",
      LLM_MODEL_NANO: "gemini-3.1-flash-lite",
    });
    const { getProviders, GeminiProvider, OpenAiProvider } = await loadFresh();
    // classifyDraftIntent = mini tier·시드/override/effort 없음 → env가 Gemini를 가리켜도
    // 커밋된 gpt-5-mini(OpenAI)로 강제된다.
    const provider = getProviders().llm.forTask("classifyDraftIntent");
    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider).not.toBeInstanceOf(GeminiProvider);
  });

  it("rejects runtime preset and task overrides in production", async () => {
    fakeEnv = baseEnv({ APP_ENV: "production", GEMINI_API_KEY: "gemini-key" });
    const { getProviders, setLlmPreset, setTaskModel } = await loadFresh();
    getProviders();
    expect(() => setLlmPreset("all-nano")).toThrow();
    expect(() =>
      setTaskModel({
        task: "classifyDraftIntent",
        modelId: "gemini-3.1-flash-lite",
      }),
    ).toThrow();
  });
});

describe("forTask effort injection (bindEffort)", () => {
  beforeEach(() => {
    // env를 명시적으로 잡는다 — 앞 describe가 GEMINI 키를 남기면 tier가 Gemini로 resolve돼
    // OpenAI 스파이 단언이 깨진다. 형제 describe 순서에 의존하지 않게 매번 초기화.
    fakeEnv = baseEnv();
    openaiResponsesParse.mockReset();
    openaiResponsesCreate.mockReset();
    // 기본 OpenAI tier 경로(구조화/텍스트)를 성공으로 모킹.
    openaiResponsesParse.mockResolvedValue({
      status: "completed",
      output: [],
      output_parsed: { ok: true },
    });
    openaiResponsesCreate.mockResolvedValue({
      status: "completed",
      output_text: "ok",
    });
  });

  it("injects the task's bound effort (extractStatements → low)", async () => {
    const { getProviders } = await loadFresh();
    await getProviders()
      .llm.forTask("extractStatements")
      .generateStructured({
        schema: z.object({ ok: z.boolean() }),
        schemaName: "t",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });
    const callArgs = openaiResponsesParse.mock.calls[0]?.[0];
    expect(callArgs.reasoning).toEqual({ effort: "low" });
  });

  it("injects no effort for a task without a bound effort (generateDraft)", async () => {
    const { getProviders } = await loadFresh();
    await getProviders()
      .llm.forTask("generateDraft")
      .generateText({
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
      });
    const callArgs = openaiResponsesCreate.mock.calls[0]?.[0];
    expect(callArgs.reasoning).toBeUndefined();
  });

  it("lets a caller-supplied effort win over the binding", async () => {
    const { getProviders } = await loadFresh();
    await getProviders()
      .llm.forTask("extractStatements")
      .generateStructured({
        schema: z.object({ ok: z.boolean() }),
        schemaName: "t",
        systemPrompt: "sys",
        messages: [{ role: "user", content: "q" }],
        effort: "high",
      });
    const callArgs = openaiResponsesParse.mock.calls[0]?.[0];
    expect(callArgs.reasoning).toEqual({ effort: "high" });
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
