import { describe, expect, it } from "vitest";

import type { QueryStructuringRaw } from "@server/prompts/query-structuring";

import { mapRawToStructure } from "./query-structuring";

const NO_TOPICS = new Set<string>();

function raw(overrides: Partial<QueryStructuringRaw>): QueryStructuringRaw {
  return { semantic: null, time: null, topicIds: [], ...overrides };
}

const ABSENT = {
  grain: null,
  offset: null,
  weekday: null,
  scope: null,
  date: null,
} as const;

describe("mapRawToStructure", () => {
  it("relative 토큰을 TimeToken으로 좁힌다", () => {
    const r = mapRawToStructure(
      raw({
        semantic: "백엔드 관련",
        time: {
          field: "due",
          boundary: "within",
          anchorKind: "relative",
          ...ABSENT,
          grain: "week",
          offset: 1,
        },
      }),
      NO_TOPICS,
    );
    expect(r.semantic).toBe("백엔드 관련");
    expect(r.time).toEqual({
      field: "due",
      boundary: "within",
      anchor: { kind: "relative", grain: "week", offset: 1 },
    });
  });

  it("weekday 토큰을 좁힌다", () => {
    const r = mapRawToStructure(
      raw({
        time: {
          field: "due",
          boundary: "by",
          anchorKind: "weekday",
          ...ABSENT,
          weekday: "fri",
          scope: "this",
        },
      }),
      NO_TOPICS,
    );
    expect(r.time).toEqual({
      field: "due",
      boundary: "by",
      anchor: { kind: "weekday", day: "fri", scope: "this" },
    });
  });

  it("absolute 토큰을 좁힌다", () => {
    const r = mapRawToStructure(
      raw({
        time: {
          field: "due",
          boundary: "within",
          anchorKind: "absolute",
          ...ABSENT,
          date: "2026-02-14",
        },
      }),
      NO_TOPICS,
    );
    expect(r.time?.anchor).toEqual({ kind: "absolute", date: "2026-02-14" });
  });

  it("불가능한 절대 날짜는 time=null로 강등한다", () => {
    const r = mapRawToStructure(
      raw({
        time: {
          field: "due",
          boundary: "within",
          anchorKind: "absolute",
          ...ABSENT,
          date: "2026-02-30",
        },
      }),
      NO_TOPICS,
    );
    expect(r.time).toBeNull();
  });

  it("anchorKind가 가리키는 필드가 비면 time=null로 강등한다", () => {
    const r = mapRawToStructure(
      raw({
        semantic: "마감",
        time: {
          field: "due",
          boundary: "within",
          anchorKind: "relative",
          ...ABSENT,
        },
      }),
      NO_TOPICS,
    );
    expect(r.semantic).toBe("마감");
    expect(r.time).toBeNull();
  });

  it("시간 없는 질의는 의미만 남는다", () => {
    const r = mapRawToStructure(
      raw({ semantic: "토스로 결제 정한 이유" }),
      NO_TOPICS,
    );
    expect(r).toEqual({
      semantic: "토스로 결제 정한 이유",
      time: null,
      topicIds: [],
    });
  });

  it("빈/공백 semantic은 null로", () => {
    expect(
      mapRawToStructure(raw({ semantic: "   " }), NO_TOPICS).semantic,
    ).toBeNull();
    expect(
      mapRawToStructure(raw({ semantic: "" }), NO_TOPICS).semantic,
    ).toBeNull();
  });

  it("목록에 없는 주제 id는 거르고 중복은 합친다", () => {
    const r = mapRawToStructure(
      raw({ semantic: "결제", topicIds: ["pay", "ghost", "pay"] }),
      new Set(["pay", "b2b"]),
    );
    expect(r.topicIds).toEqual(["pay"]);
  });
});
