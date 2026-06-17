import { describe, expect, it } from "vitest";

import { DRAFT_TOPICS_MAX, TOPIC_NAME_MAX_LENGTH } from "@nema-io/shared";

import { sanitizeTopics } from "./draft-assist";

// sanitizeTopics는 LLM(신뢰 경계 밖) 출력의 마지막 방어선이다 — 길이·중복·개수 회귀를 잠근다.
describe("sanitizeTopics", () => {
  it("공백을 trim하고 빈/공백-only 항목은 버린다", () => {
    expect(sanitizeTopics(["  마케팅  ", "", "   ", "예산"])).toEqual([
      "마케팅",
      "예산",
    ]);
  });

  it("trim 후 값으로 중복을 제거한다", () => {
    expect(sanitizeTopics(["마케팅", " 마케팅 ", "마케팅"])).toEqual([
      "마케팅",
    ]);
  });

  it("길이를 TOPIC_NAME_MAX_LENGTH로 자른다", () => {
    const long = "가".repeat(TOPIC_NAME_MAX_LENGTH + 10);
    expect(sanitizeTopics([long])).toEqual([
      "가".repeat(TOPIC_NAME_MAX_LENGTH),
    ]);
  });

  it("중복은 상한을 소모하지 않고, 상한은 고유 항목 기준으로 적용된다", () => {
    // "x" 1회 중복 + 고유 6개 → 고유 7개 후보지만 상한(5)에서 끊긴다.
    const result = sanitizeTopics(["x", "x", "a", "b", "c", "d", "e"]);
    expect(result).toEqual(["x", "a", "b", "c", "d"]);
    expect(result.length).toBe(DRAFT_TOPICS_MAX);
  });

  it("빈 배열은 빈 배열로", () => {
    expect(sanitizeTopics([])).toEqual([]);
  });
});
