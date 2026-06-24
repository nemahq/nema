import { describe, expect, it, vi } from "vitest";

import type { Providers } from "@server/infra/providers";

import { selectScopeTopics } from "./coarse-scoping";

function providersStub(topicIds: string[], generateStructured = vi.fn()) {
  generateStructured.mockResolvedValue({ topicIds });
  return {
    llm: { forTask: () => ({ generateStructured }) },
  } as unknown as Providers;
}

describe("selectScopeTopics", () => {
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
});
