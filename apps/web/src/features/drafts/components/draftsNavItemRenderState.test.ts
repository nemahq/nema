import { describe, expect, it } from "vitest";

import { nextDraftsNavItemRenderState } from "./draftsNavItemRenderState";

describe("nextDraftsNavItemRenderState", () => {
  it("첫 로드가 아직 안 끝난 시점엔 초안이 있어도 애니메이션 없이 바로 visible이다 (새로고침 리그레션 방지)", () => {
    const result = nextDraftsNavItemRenderState({
      isVisible: true,
      wasVisible: false,
      hadLoadedBefore: false,
    });
    expect(result).toEqual({
      state: "visible",
      animated: false,
      settledState: "visible",
    });
  });

  it("첫 로드를 마친 뒤 0개에서 새로 생기면 entering으로 들어간다", () => {
    const result = nextDraftsNavItemRenderState({
      isVisible: true,
      wasVisible: false,
      hadLoadedBefore: true,
    });
    expect(result).toEqual({
      state: "entering",
      animated: true,
      settledState: "visible",
    });
  });

  it("이미 보이고 있었으면 계속 visible이다 (재애니메이션 없음)", () => {
    const result = nextDraftsNavItemRenderState({
      isVisible: true,
      wasVisible: true,
      hadLoadedBefore: true,
    });
    expect(result).toEqual({
      state: "visible",
      animated: false,
      settledState: "visible",
    });
  });

  it("처음부터 0개였다면 바로 hidden이다 (접을 애니메이션 없음)", () => {
    const result = nextDraftsNavItemRenderState({
      isVisible: false,
      wasVisible: false,
      hadLoadedBefore: true,
    });
    expect(result).toEqual({
      state: "hidden",
      animated: false,
      settledState: "hidden",
    });
  });

  it("보이던 상태에서 0개가 되면 exiting을 거쳐 hidden으로 정착한다", () => {
    const result = nextDraftsNavItemRenderState({
      isVisible: false,
      wasVisible: true,
      hadLoadedBefore: true,
    });
    expect(result).toEqual({
      state: "exiting",
      animated: true,
      settledState: "hidden",
    });
  });
});
