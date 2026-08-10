import { describe, expect, it } from "vitest";

import { shouldNavigateHomeAfterSpaceDelete } from "./shouldNavigateHomeAfterSpaceDelete";

describe("shouldNavigateHomeAfterSpaceDelete", () => {
  it("지금 보고 있던 Space를 지운 경우 홈으로 이동한다", () => {
    expect(shouldNavigateHomeAfterSpaceDelete("space-a", "space-a")).toBe(true);
  });

  it("관계없는 Space를 지운 경우 이동하지 않는다", () => {
    expect(shouldNavigateHomeAfterSpaceDelete("space-b", "space-a")).toBe(
      false,
    );
  });

  it("Space 라우트 밖(예: 홈)에 있을 때 지운 경우 이동하지 않는다", () => {
    expect(shouldNavigateHomeAfterSpaceDelete("space-a", undefined)).toBe(
      false,
    );
  });
});
