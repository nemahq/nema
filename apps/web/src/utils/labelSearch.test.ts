import { describe, expect, it } from "vitest";

import {
  filterActiveLabelCandidates,
  hasExactLabelMatch,
  isDuplicateLabelName,
} from "./labelSearch";

interface Topic {
  id: string;
  status: string;
  title: string;
}

const TOPICS: Topic[] = [
  { id: "t1", status: "active", title: "결제" },
  { id: "t2", status: "active", title: "결제 실패" },
  { id: "t3", status: "archived", title: "결제 재시도" },
];

describe("filterActiveLabelCandidates", () => {
  it("archived 상태는 후보에서 제외한다", () => {
    const result = filterActiveLabelCandidates(
      TOPICS,
      (t) => t.title,
      "결제",
      new Set(),
    );
    expect(result.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("이미 붙은 항목(excludedIds)은 제외한다", () => {
    const result = filterActiveLabelCandidates(
      TOPICS,
      (t) => t.title,
      "결제",
      new Set(["t1"]),
    );
    expect(result.map((t) => t.id)).toEqual(["t2"]);
  });

  it("검색어는 대소문자 무시 부분일치로 필터링한다", () => {
    const result = filterActiveLabelCandidates(
      TOPICS,
      (t) => t.title,
      "실패",
      new Set(),
    );
    expect(result.map((t) => t.id)).toEqual(["t2"]);
  });

  it("검색어가 비어 있으면 active 전체를 반환한다", () => {
    const result = filterActiveLabelCandidates(
      TOPICS,
      (t) => t.title,
      "",
      new Set(),
    );
    expect(result.map((t) => t.id)).toEqual(["t1", "t2"]);
  });
});

describe("hasExactLabelMatch", () => {
  it("대소문자 무시 완전일치면 true", () => {
    expect(hasExactLabelMatch(TOPICS, (t) => t.title, "결제")).toBe(true);
  });

  it("부분일치만으로는 false", () => {
    expect(hasExactLabelMatch(TOPICS, (t) => t.title, "결제 실")).toBe(false);
  });
});

describe("isDuplicateLabelName", () => {
  it("이미 붙은 라벨과 대소문자 무시 완전일치면 true", () => {
    expect(isDuplicateLabelName("결제", ["결제", "환불"])).toBe(true);
  });

  it("일치하는 게 없으면 false", () => {
    expect(isDuplicateLabelName("배송", ["결제", "환불"])).toBe(false);
  });

  it("앞뒤 공백을 무시하고 비교한다", () => {
    expect(isDuplicateLabelName("  결제  ", ["결제"])).toBe(true);
  });
});
