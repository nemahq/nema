import { describe, expect, it } from "vitest";

import { isSpaceNameTaken } from "./isSpaceNameTaken";

const spaces = [
  { id: "space-a", name: "Marketing" },
  { id: "space-b", name: "Engineering" },
];

describe("isSpaceNameTaken", () => {
  it("이미 있는 이름이면 true (생성 — 제외 대상 없음)", () => {
    expect(isSpaceNameTaken(spaces, "Marketing")).toBe(true);
  });

  it("없는 이름이면 false", () => {
    expect(isSpaceNameTaken(spaces, "Design")).toBe(false);
  });

  it("대소문자가 다르면 다른 이름으로 취급한다(서버 uniq 제약과 동일)", () => {
    expect(isSpaceNameTaken(spaces, "marketing")).toBe(false);
  });

  it("자기 자신의 현재 이름은 제외 대상이라 true가 아니다(이름변경 — 미변경 케이스)", () => {
    expect(isSpaceNameTaken(spaces, "Marketing", "space-a")).toBe(false);
  });

  it("자기 자신을 제외해도 다른 Space가 그 이름을 쓰고 있으면 여전히 true", () => {
    expect(isSpaceNameTaken(spaces, "Engineering", "space-a")).toBe(true);
  });
});
