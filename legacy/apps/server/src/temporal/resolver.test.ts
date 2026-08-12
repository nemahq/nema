import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";

import { resolveTimeToken } from "./resolver";
import type { TimeToken } from "./token";

const SEOUL = "Asia/Seoul";
// 기준 = 서울 2026-06-24(수) 10:00. 주(월요일 시작) = 06-22 ~ 06-28.
const REF_SEOUL_WED = new Date("2026-06-24T10:00:00+09:00");

function token(
  boundary: TimeToken["boundary"],
  anchor: TimeToken["anchor"],
): TimeToken {
  return { field: "due", boundary, anchor };
}

/** 그 존의 벽시계 날짜(YYYY-MM-DD)와 시각(HH:mm:ss.SSS)으로 비교 — instant 비교의 가독 버전 */
function wall(date: Date | null, zone: string): string | null {
  if (date === null) {
    return null;
  }
  return DateTime.fromJSDate(date, { zone }).toFormat(
    "yyyy-MM-dd HH:mm:ss.SSS",
  );
}

describe("resolveTimeToken — relative grain (within)", () => {
  const ctx = { reference: REF_SEOUL_WED, timeZone: SEOUL };

  it("이번 주 = 월요일~일요일 (week, 0)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "week", offset: 0 }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-22 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-06-28 23:59:59.999");
  });

  it("다음주 (week, +1)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "week", offset: 1 }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-29 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-07-05 23:59:59.999");
  });

  it("지난주 (week, -1)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "week", offset: -1 }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-15 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-06-21 23:59:59.999");
  });

  it("모레 (day, +2)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "day", offset: 2 }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-26 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-06-26 23:59:59.999");
  });

  it("이달 (month, 0)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "month", offset: 0 }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-01 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-06-30 23:59:59.999");
  });

  it("다음 분기 = Q2→Q3, 연도 안 넘김 (quarter, +1)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "quarter", offset: 1 }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-07-01 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-09-30 23:59:59.999");
  });

  it("다음 분기가 Q4 기준이면 이듬해 Q1로 넘어간다", () => {
    const refQ4 = new Date("2026-11-10T10:00:00+09:00");
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "quarter", offset: 1 }),
      { reference: refQ4, timeZone: SEOUL },
    );
    expect(wall(r.from, SEOUL)).toBe("2027-01-01 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2027-03-31 23:59:59.999");
  });
});

describe("resolveTimeToken — weekday", () => {
  const ctx = { reference: REF_SEOUL_WED, timeZone: SEOUL };

  it("이번 주 금요일 (this) — 기준 수요일보다 뒤", () => {
    const r = resolveTimeToken(
      token("within", { kind: "weekday", day: "fri", scope: "this" }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-26 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-06-26 23:59:59.999");
  });

  it("이번 주 월요일 (this) — 기준 수요일보다 앞이어도 같은 주", () => {
    const r = resolveTimeToken(
      token("within", { kind: "weekday", day: "mon", scope: "this" }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-06-22 00:00:00.000");
  });

  it("다음주 수요일 (next)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "weekday", day: "wed", scope: "next" }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-07-01 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-07-01 23:59:59.999");
  });
});

describe("resolveTimeToken — absolute", () => {
  const ctx = { reference: REF_SEOUL_WED, timeZone: SEOUL };

  it("2026-02-14 = 그 날 하루 (존 기준)", () => {
    const r = resolveTimeToken(
      token("within", { kind: "absolute", date: "2026-02-14" }),
      ctx,
    );
    expect(wall(r.from, SEOUL)).toBe("2026-02-14 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-02-14 23:59:59.999");
  });

  it("형식은 맞지만 존재하지 않는 날짜(2026-02-30)는 던진다", () => {
    expect(() =>
      resolveTimeToken(
        token("within", { kind: "absolute", date: "2026-02-30" }),
        ctx,
      ),
    ).toThrow(/invalid absolute date/);
  });
});

describe("resolveTimeToken — boundary", () => {
  const ctx = { reference: REF_SEOUL_WED, timeZone: SEOUL };

  it("by(마감)는 아래끝을 열어 둔다 — 금요일까지", () => {
    const r = resolveTimeToken(
      token("by", { kind: "weekday", day: "fri", scope: "this" }),
      ctx,
    );
    expect(r.from).toBeNull();
    expect(wall(r.to, SEOUL)).toBe("2026-06-26 23:59:59.999");
  });

  it("by + 이번 주 = [null, 그 주 끝]", () => {
    const r = resolveTimeToken(
      token("by", { kind: "relative", grain: "week", offset: 0 }),
      ctx,
    );
    expect(r.from).toBeNull();
    expect(wall(r.to, SEOUL)).toBe("2026-06-28 23:59:59.999");
  });
});

describe("resolveTimeToken — 존 인식 (글로벌 제품의 핵심)", () => {
  // 같은 순간이지만 존이 다르면 "오늘"의 날이 다르다.
  // 이 instant는 서울 06-25 00:30(목), LA 06-24 08:30(수).
  const sameInstant = new Date("2026-06-24T15:30:00Z");
  const todayWithin = token("within", {
    kind: "relative",
    grain: "day",
    offset: 0,
  });

  it("오늘 — 서울에선 06-25", () => {
    const r = resolveTimeToken(todayWithin, {
      reference: sameInstant,
      timeZone: SEOUL,
    });
    expect(wall(r.from, SEOUL)).toBe("2026-06-25 00:00:00.000");
    expect(wall(r.to, SEOUL)).toBe("2026-06-25 23:59:59.999");
  });

  it("오늘 — LA에선 같은 순간이 06-24", () => {
    const LA = "America/Los_Angeles";
    const r = resolveTimeToken(todayWithin, {
      reference: sameInstant,
      timeZone: LA,
    });
    expect(wall(r.from, LA)).toBe("2026-06-24 00:00:00.000");
    expect(wall(r.to, LA)).toBe("2026-06-24 23:59:59.999");
  });

  it("잘못된 존은 던진다", () => {
    expect(() =>
      resolveTimeToken(todayWithin, {
        reference: sameInstant,
        timeZone: "Not/AZone",
      }),
    ).toThrow(/invalid reference\/timeZone/);
  });
});

describe("resolveTimeToken — DST 경계", () => {
  // 미국 동부 서머타임 시작일(2026-03-08): 그날은 23시간이지만 날 경계는 그대로다.
  it("뉴욕 DST 시작일의 '오늘'도 자정~자정으로 닫힌다", () => {
    const NY = "America/New_York";
    const refDstDay = new Date("2026-03-08T12:00:00-05:00");
    const r = resolveTimeToken(
      token("within", { kind: "relative", grain: "day", offset: 0 }),
      { reference: refDstDay, timeZone: NY },
    );
    expect(wall(r.from, NY)).toBe("2026-03-08 00:00:00.000");
    expect(wall(r.to, NY)).toBe("2026-03-08 23:59:59.999");
  });
});
