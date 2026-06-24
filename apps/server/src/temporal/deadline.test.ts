import { describe, expect, it } from "vitest";

import type { ExtractedDeadline } from "./deadline";
import { resolveDeadlineToDueDate } from "./deadline";

// 작성 기준 = 서울 2026-06-11(목). 주(월요일 시작) = 06-08 ~ 06-14.
const CTX = {
  reference: new Date("2026-06-11T00:00:00+09:00"),
  timeZone: "Asia/Seoul",
};

const ABSENT = {
  grain: null,
  offset: null,
  weekday: null,
  scope: null,
  date: null,
} as const;

function deadline(overrides: Partial<ExtractedDeadline>): ExtractedDeadline {
  return { boundary: "by", anchorKind: "relative", ...ABSENT, ...overrides };
}

describe("resolveDeadlineToDueDate", () => {
  it("이번 주 마감(by week 0) → 그 주 끝(일요일)", () => {
    const due = resolveDeadlineToDueDate(
      deadline({ anchorKind: "relative", grain: "week", offset: 0 }),
      CTX,
    );
    expect(due).toBe("2026-06-14");
  });

  it("금요일까지(by weekday fri this) → 그 금요일", () => {
    const due = resolveDeadlineToDueDate(
      deadline({ anchorKind: "weekday", weekday: "fri", scope: "this" }),
      CTX,
    );
    expect(due).toBe("2026-06-12");
  });

  it("다음주 화요일까지(by weekday tue next) → 다음 주 화요일", () => {
    const due = resolveDeadlineToDueDate(
      deadline({ anchorKind: "weekday", weekday: "tue", scope: "next" }),
      CTX,
    );
    expect(due).toBe("2026-06-16");
  });

  it("절대 날짜는 그 날", () => {
    const due = resolveDeadlineToDueDate(
      deadline({ anchorKind: "absolute", date: "2026-02-14" }),
      CTX,
    );
    expect(due).toBe("2026-02-14");
  });

  it("anchorKind가 가리키는 필드가 비면 null(기한 없는 것으로 강등)", () => {
    expect(
      resolveDeadlineToDueDate(deadline({ anchorKind: "relative" }), CTX),
    ).toBeNull();
  });

  it("불가능한 절대 날짜(2026-02-30)는 null", () => {
    expect(
      resolveDeadlineToDueDate(
        deadline({ anchorKind: "absolute", date: "2026-02-30" }),
        CTX,
      ),
    ).toBeNull();
  });

  it("작성 존이 due_date 날 경계를 가른다 — 같은 순간이라도 존이 다르면 다른 날", () => {
    // 이 instant는 서울 06-12 00:30(금), LA 06-11 08:30(목).
    const instant = new Date("2026-06-11T15:30:00Z");
    const today = deadline({ anchorKind: "relative", grain: "day", offset: 0 });
    expect(
      resolveDeadlineToDueDate(today, {
        reference: instant,
        timeZone: "Asia/Seoul",
      }),
    ).toBe("2026-06-12");
    expect(
      resolveDeadlineToDueDate(today, {
        reference: instant,
        timeZone: "America/Los_Angeles",
      }),
    ).toBe("2026-06-11");
  });
});
