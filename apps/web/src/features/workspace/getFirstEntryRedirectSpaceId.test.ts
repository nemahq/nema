import { describe, expect, it } from "vitest";

import { getFirstEntryRedirectSpaceId } from "./getFirstEntryRedirectSpaceId";

describe("getFirstEntryRedirectSpaceId", () => {
  it("첫 진입이 아니면 Space 목록이 있어도 리다이렉트하지 않는다", () => {
    expect(
      getFirstEntryRedirectSpaceId(false, "/", [{ publicId: "space-a" }]),
    ).toBeNull();
  });

  it("첫 진입이어도 홈이 아닌 경로면 리다이렉트하지 않는다", () => {
    expect(
      getFirstEntryRedirectSpaceId(true, "/space/space-a", [
        { publicId: "space-a" },
      ]),
    ).toBeNull();
  });

  it("space.list가 bootstrap보다 늦게 도착해도(아직 undefined) 리다이렉트하지 않고 대기한다", () => {
    expect(getFirstEntryRedirectSpaceId(true, "/", undefined)).toBeNull();
  });

  it("Space 목록이 빈 배열이면 리다이렉트하지 않는다", () => {
    expect(getFirstEntryRedirectSpaceId(true, "/", [])).toBeNull();
  });

  it("첫 진입 + 홈 + Space 존재 시 첫 번째 Space로 리다이렉트한다", () => {
    expect(
      getFirstEntryRedirectSpaceId(true, "/", [
        { publicId: "space-a" },
        { publicId: "space-b" },
      ]),
    ).toBe("space-a");
  });
});
