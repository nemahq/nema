import { describe, expect, it } from "vitest";

import { getModelSpec } from "@server/infra/llm/model-catalog";
import {
  DIGEST_GENERATION_MODEL_GEMINI,
  DIGEST_GENERATION_MODEL_OPENAI,
} from "@server/infra/llm/models";

describe("getModelSpec", () => {
  it("returns the provider for a registered model id", () => {
    expect(getModelSpec(DIGEST_GENERATION_MODEL_OPENAI)).toEqual({
      id: DIGEST_GENERATION_MODEL_OPENAI,
      provider: "openai",
    });
    expect(getModelSpec(DIGEST_GENERATION_MODEL_GEMINI)).toEqual({
      id: DIGEST_GENERATION_MODEL_GEMINI,
      provider: "google",
    });
  });

  it("returns undefined for a model id absent from the catalog", () => {
    expect(getModelSpec("not-a-real-model")).toBeUndefined();
  });
});
