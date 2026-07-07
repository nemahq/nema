import { describe, expect, it } from "vitest";

import type { DigestBody } from "@nema-io/shared";

import { buildDigestExtractionMessage } from "./digest-extraction";

const HEADER = { title: "제목", description: "요약" };

describe("buildDigestExtractionMessage", () => {
  it("decision — 유형·헤더·칸 라벨을 렌더하고 빈 칸은 생략한다", () => {
    const body: DigestBody = {
      type: "decision",
      situation: "무엇을 정할지",
      choice: "A로 정함",
      // reason 없음 → 생략
      tradeoff: ["B 포기"],
      alternatives: [], // 빈 리스트 → 생략
    };
    const msg = buildDigestExtractionMessage(
      { ...HEADER, body },
      { todayIsoDate: "2026-06-11" },
    );

    expect(msg).toContain("<today>2026-06-11</today>");
    expect(msg).toContain("type: decision");
    expect(msg).toContain("title: 제목");
    expect(msg).toContain("situation: 무엇을 정할지");
    expect(msg).toContain("choice: A로 정함");
    expect(msg).toContain("tradeoff:\n- B 포기");
    expect(msg).not.toContain("reason:");
    expect(msg).not.toContain("alternatives:");
  });

  it("빈 문자열·공백만 있는 칸은 없는 것으로 취급한다", () => {
    const body: DigestBody = {
      type: "learning",
      finding: "확인함",
      evidence: "   ",
    };
    const msg = buildDigestExtractionMessage({ ...HEADER, body });

    expect(msg).toContain("finding: 확인함");
    expect(msg).not.toContain("evidence:");
  });

  it("todayIsoDate가 없으면 <today>를 붙이지 않는다", () => {
    const msg = buildDigestExtractionMessage({
      ...HEADER,
      body: { type: "learning", finding: "x" },
    });
    expect(msg).not.toContain("<today>");
  });

  it("리스트 칸은 - 불릿으로 렌더하고, 다른 유형의 칸은 새지 않는다", () => {
    const body: DigestBody = {
      type: "idea",
      concept: "아이디어",
      branches: ["갈래1", "갈래2"],
    };
    const msg = buildDigestExtractionMessage({ ...HEADER, body });

    expect(msg).toContain("branches:\n- 갈래1\n- 갈래2");
    expect(msg).not.toContain("situation:"); // decision 전용 칸이 안 샌다
  });

  // 새 DigestBody 유형을 추가하면서 renderBody의 switch case를 빠뜨리면(default 없음)
  // 그 유형의 body가 빈 채로 프롬프트에 흘러 추출이 조용히 저하된다 — 이 목록에 유형을
  // 추가하는 순간 여기서 잡힌다.
  it("5개 유형이 각자 body 칸을 렌더한다", () => {
    const cases: Array<{ body: DigestBody; contains: string }> = [
      { body: { type: "decision", choice: "c" }, contains: "choice: c" },
      { body: { type: "pending", question: "q" }, contains: "question: q" },
      { body: { type: "learning", finding: "f" }, contains: "finding: f" },
      { body: { type: "idea", concept: "i" }, contains: "concept: i" },
      {
        body: { type: "assumption", assumption: "a" },
        contains: "assumption: a",
      },
    ];
    for (const { body, contains } of cases) {
      const msg = buildDigestExtractionMessage({ ...HEADER, body });
      expect(msg).toContain(`type: ${body.type}`);
      expect(msg).toContain(contains);
    }
  });
});
