import { describe, expect, it } from "vitest";

import { buildErrorReport } from "./errorReport";

const ROUTE = "/space/abc123/changesets/42";
const TIMESTAMP = "2026-07-26T09:12:03.000Z";

describe("buildErrorReport", () => {
  it("eventId·componentStack이 없으면 해당 줄 자체를 생략한다", () => {
    const report = buildErrorReport({
      error: new Error("boom"),
      route: ROUTE,
      timestamp: TIMESTAMP,
    });

    expect(report).not.toContain("Event ID:");
    expect(report).not.toContain("Component Stack:");
  });

  it("eventId·componentStack이 있으면 포함한다", () => {
    const report = buildErrorReport({
      error: new Error("boom"),
      route: ROUTE,
      timestamp: TIMESTAMP,
      eventId: "7f3a2b91",
      componentStack: "at MemoryDetail\n  at MemoryList",
    });

    expect(report).toContain("Event ID: 7f3a2b91");
    expect(report).toContain("Component Stack:");
    expect(report).toContain("at MemoryDetail");
  });
});
