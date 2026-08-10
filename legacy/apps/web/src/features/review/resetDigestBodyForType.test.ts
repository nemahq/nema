import { describe, expect, it } from "vitest";

import { resetDigestBodyForType } from "./resetDigestBodyForType";

describe("resetDigestBodyForType", () => {
  it("이전 타입의 필드를 전혀 들고 오지 않는다", () => {
    expect(resetDigestBodyForType("learning")).toEqual({ type: "learning" });
  });

  it("타입별로 서로 다른 값을 돌려준다", () => {
    expect(resetDigestBodyForType("decision")).toEqual({ type: "decision" });
    expect(resetDigestBodyForType("pending")).toEqual({ type: "pending" });
  });
});
