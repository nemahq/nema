import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildErrorReport } from "./errorReport";

describe("buildErrorReport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T09:12:03.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("쿼리스트링·해시는 담지 않는다 — 토큰·검색어가 섞여 들어올 수 있는 자리라 pathname만 남긴다", () => {
    window.history.pushState(
      {},
      "",
      "/space/abc123/changesets/42?token=secret&search=name#section",
    );

    const report = buildErrorReport({ error: new Error("boom") });

    expect(report).toContain("Route: /space/abc123/changesets/42");
    expect(report).not.toContain("token=secret");
    expect(report).not.toContain("search=name");
  });

  it("eventId·componentStack이 없으면 해당 줄 자체를 생략한다", () => {
    const report = buildErrorReport({ error: new Error("boom") });

    expect(report).not.toContain("Event ID:");
    expect(report).not.toContain("Component Stack:");
  });

  it("eventId·componentStack이 있으면 포함한다", () => {
    const report = buildErrorReport({
      error: new Error("boom"),
      eventId: "7f3a2b91",
      componentStack: "  at MemoryDetail\n  at MemoryList",
    });

    expect(report).toContain("Event ID: 7f3a2b91");
    expect(report).toContain(
      "Component Stack:\nat MemoryDetail\n  at MemoryList",
    );
  });
});
