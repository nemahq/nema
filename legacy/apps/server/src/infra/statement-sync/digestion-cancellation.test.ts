import { describe, expect, it } from "vitest";

import {
  abortDigestion,
  registerDigestion,
  unregisterDigestion,
} from "./digestion-cancellation";

const SOURCE_ID = "a0000000-0000-4000-a000-000000000001";

describe("digestion-cancellation", () => {
  it("등록된 원문의 취소는 그 controller를 끊는다", () => {
    const controller = new AbortController();
    registerDigestion(SOURCE_ID, controller);

    abortDigestion(SOURCE_ID);

    expect(controller.signal.aborted).toBe(true);
    unregisterDigestion(SOURCE_ID, controller);
  });

  it("떠 있는 콜이 없으면 조용히 넘긴다 — 취소의 정본은 DB고 이건 비용 절감 경로다", () => {
    expect(() =>
      abortDigestion("b0000000-0000-4000-a000-000000000009"),
    ).not.toThrow();
  });

  it("정리한 뒤엔 취소가 아무것도 안 끊는다", () => {
    const controller = new AbortController();
    registerDigestion(SOURCE_ID, controller);
    unregisterDigestion(SOURCE_ID, controller);

    abortDigestion(SOURCE_ID);

    expect(controller.signal.aborted).toBe(false);
  });

  // 리스(150초)를 넘긴 시도가 뒤늦게 정리할 때, 같은 원문을 다시 집은 새 시도의 controller까지
  // 지워버리면 그 시도는 취소가 영영 닿지 않는 유령이 된다.
  it("옛 시도의 늦은 정리가 새 시도의 controller를 지우지 않는다 — 취소는 여전히 새 시도에 닿는다", () => {
    const stale = new AbortController();
    const fresh = new AbortController();

    registerDigestion(SOURCE_ID, stale);
    registerDigestion(SOURCE_ID, fresh); // 리스 만료 후 재클레임
    unregisterDigestion(SOURCE_ID, stale); // 옛 시도가 뒤늦게 정리

    abortDigestion(SOURCE_ID);

    expect(fresh.signal.aborted).toBe(true);
    expect(stale.signal.aborted).toBe(false);
    unregisterDigestion(SOURCE_ID, fresh);
  });
});
