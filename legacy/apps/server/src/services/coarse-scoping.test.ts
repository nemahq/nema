import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";

import type { Providers } from "@server/infra/providers";

import { selectScopeTopics } from "./coarse-scoping";

vi.mock("@sentry/node", () => ({ captureMessage: vi.fn() }));

function providersStub(topicIds: string[], generateStructured = vi.fn()) {
  generateStructured.mockResolvedValue({ topicIds });
  return {
    llm: { forTask: () => ({ generateStructured }) },
  } as unknown as Providers;
}

describe("selectScopeTopics", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  it("목록에 없는 id는 거르고 중복은 합친다 — 헛 id가 scope를 오염시키지 않게", async () => {
    const r = await selectScopeTopics({
      providers: providersStub(["pay", "ghost", "pay"]),
      query: "결제",
      topics: [
        { id: "pay", label: "결제" },
        { id: "b2b", label: "B2B" },
      ],
    });
    expect(r).toEqual(["pay"]);
    // 하나라도 골랐으면 정상 — 경보를 울리지 않는다.
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("주제가 없으면 LLM 콜 없이 빈 배열(전역)", async () => {
    const generateStructured = vi.fn();
    const r = await selectScopeTopics({
      providers: providersStub([], generateStructured),
      query: "결제",
      topics: [],
    });
    expect(r).toEqual([]);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("id를 냈는데 전부 목록 밖이면 빈 배열 + 강등 신호를 남긴다 — 의도된 전역과 조용히 섞이지 않게", async () => {
    const r = await selectScopeTopics({
      providers: providersStub(["ghost", "phantom"]),
      query: "결제",
      topics: [{ id: "pay", label: "결제" }],
    });
    expect(r).toEqual([]);
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        tags: expect.objectContaining({ outcome: "all-invalid-ids" }),
      }),
    );
  });
});
