import { describe, expect, it } from "vitest";

import {
  buildDraftRenameExistingLabels,
  filterActiveLabelCandidates,
  filterDraftLabelCandidates,
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

interface DraftTopic {
  id: string | null;
  title: string;
}

const DRAFT_TOPICS: DraftTopic[] = [
  { id: "t1", title: "결제" },
  { id: null, title: "결제 재시도" },
  { id: null, title: "환불" },
];

describe("filterDraftLabelCandidates", () => {
  it("id가 null인 draft만 후보로 남긴다", () => {
    const result = filterDraftLabelCandidates(DRAFT_TOPICS, "");
    expect(result.map(({ item }) => item.title)).toEqual([
      "결제 재시도",
      "환불",
    ]);
  });

  it("원래 배열의 index를 그대로 들고 있다", () => {
    const result = filterDraftLabelCandidates(DRAFT_TOPICS, "");
    expect(result.map(({ index }) => index)).toEqual([1, 2]);
  });

  it("검색어로 draft도 다른 후보와 같이 필터링된다", () => {
    const result = filterDraftLabelCandidates(DRAFT_TOPICS, "재시도");
    expect(result).toEqual([{ item: DRAFT_TOPICS[1], index: 1 }]);
  });
});

describe("buildDraftRenameExistingLabels", () => {
  it("레지스트리 이름과 다른 라벨 이름을 합친다", () => {
    const result = buildDraftRenameExistingLabels(
      ["결제"],
      ["결제 재시도", "환불"],
      -1,
    );
    expect(result).toEqual(["결제", "결제 재시도", "환불"]);
  });

  it("excludeAt에 해당하는 자기 자신은 뺀다", () => {
    const result = buildDraftRenameExistingLabels(
      ["결제"],
      ["결제 재시도", "환불"],
      0,
    );
    expect(result).toEqual(["결제", "환불"]);
  });
});
