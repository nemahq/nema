import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatCompactDistance } from "./relativeTimeFormat";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;
const NOW = new Date("2026-07-15T12:00:00.000Z").getTime();

function dateTimeAgo(elapsedMs: number): string {
  return new Date(NOW - elapsedMs).toISOString();
}

describe("formatCompactDistance", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["en", MINUTE_MS - 1, "now"],
    ["ko", MINUTE_MS - 1, "방금"],
    ["en", MINUTE_MS, "1m"],
    ["ko", MINUTE_MS, "1분"],
    ["en", HOUR_MS - 1, "59m"],
    ["en", HOUR_MS, "1h"],
    ["en", DAY_MS - 1, "23h"],
    ["en", DAY_MS, "1d"],
    ["en", MONTH_MS - 1, "29d"],
    ["en", MONTH_MS, "1mo"],
    ["en", YEAR_MS - 1, "12mo"],
    ["en", YEAR_MS, "1y"],
    ["en", 2 * YEAR_MS, "2y"],
  ] as const)("경계값 %s / %ims -> %s", (lang, elapsedMs, expected) => {
    expect(formatCompactDistance(dateTimeAgo(elapsedMs), lang)).toBe(expected);
  });

  it("초 단위 나머지는 반올림하지 않고 버린다 — 90초는 2분이 아니라 1분", () => {
    expect(formatCompactDistance(dateTimeAgo(90_000), "en")).toBe("1m");
  });
});
