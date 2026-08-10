import { describe, expect, it } from "vitest";

import { isSpaceNameTaken } from "./isSpaceNameTaken";

const spaces = [
  {
    id: "space-a",
    publicId: "spc_a",
    name: "Marketing",
    createdAt: "2024-01-01T00:00:00Z",
    openChangesetCount: 0,
  },
  {
    id: "space-b",
    publicId: "spc_b",
    name: "Engineering",
    createdAt: "2024-01-02T00:00:00Z",
    openChangesetCount: 0,
  },
];

describe("isSpaceNameTaken", () => {
  it("이미 있는 이름이면 true (생성 — 제외 대상 없음)", () => {
    expect(isSpaceNameTaken(spaces, "Marketing")).toBe(true);
  });

  it("없는 이름이면 false", () => {
    expect(isSpaceNameTaken(spaces, "Design")).toBe(false);
  });

  it("대소문자가 달라도 같은 이름으로 취급한다(서버 uniq 인덱스와 동일)", () => {
    expect(isSpaceNameTaken(spaces, "marketing")).toBe(true);
  });

  it("자기 자신의 현재 이름은 제외 대상이라 true가 아니다(이름변경 — 미변경 케이스)", () => {
    expect(isSpaceNameTaken(spaces, "Marketing", "space-a")).toBe(false);
  });

  it("자기 자신을 제외해도 다른 Space가 그 이름을 쓰고 있으면 여전히 true", () => {
    expect(isSpaceNameTaken(spaces, "Engineering", "space-a")).toBe(true);
  });

  it("NFC/NFD 정규화 형태가 달라도 같은 이름으로 취급한다(서버 uniq 인덱스와 동일)", () => {
    const nfcName = "Marketing " + String.fromCharCode(0x00e9); // "e" + acute (precomposed)
    const nfdName = "Marketing e" + String.fromCharCode(0x0301); // "e" + combining acute (decomposed)
    const spacesWithAccent = [
      {
        id: "space-c",
        publicId: "spc_c",
        name: nfcName,
        createdAt: "2024-01-03T00:00:00Z",
        openChangesetCount: 0,
      },
    ];
    expect(isSpaceNameTaken(spacesWithAccent, nfdName)).toBe(true);
  });
});
