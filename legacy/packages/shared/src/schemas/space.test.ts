import { describe, expect, it } from "vitest";

import {
  containsForbiddenSpaceNameChars,
  SpaceCreateInputSchema,
} from "./space";

describe("containsForbiddenSpaceNameChars", () => {
  it("일반 텍스트는 허용", () => {
    expect(containsForbiddenSpaceNameChars("My Space")).toBe(false);
  });

  it("한글은 허용", () => {
    expect(containsForbiddenSpaceNameChars("우리 팀")).toBe(false);
  });

  it("이모지는 허용", () => {
    expect(
      containsForbiddenSpaceNameChars(String.fromCodePoint(0x1f680) + " Team"),
    ).toBe(false);
  });

  it("zero-width space만으로 채운 이름은 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(String.fromCharCode(0x200b, 0x200b)),
    ).toBe(true);
  });

  it("양방향 텍스트 override 문자는 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(
        "abc" + String.fromCharCode(0x202e) + "def",
      ),
    ).toBe(true);
  });

  it("BOM(zero width no-break space)은 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(
        "abc" + String.fromCharCode(0xfeff) + "def",
      ),
    ).toBe(true);
  });

  it("C0 제어문자는 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(
        "abc" + String.fromCharCode(0x0007) + "def",
      ),
    ).toBe(true);
  });

  it("C1 제어문자는 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(
        "abc" + String.fromCharCode(0x0085) + "def",
      ),
    ).toBe(true);
  });

  it("한글 채움 문자(U+3164)만으로 채운 이름은 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(String.fromCharCode(0x3164, 0x3164)),
    ).toBe(true);
  });

  it("반각 한글 채움 문자(U+FFA0)만으로 채운 이름은 차단", () => {
    expect(
      containsForbiddenSpaceNameChars(String.fromCharCode(0xffa0, 0xffa0)),
    ).toBe(true);
  });

  it("Unicode Tag 블록 문자는 차단", () => {
    expect(containsForbiddenSpaceNameChars(String.fromCodePoint(0xe0001))).toBe(
      true,
    );
  });
});

describe("SpaceCreateInputSchema", () => {
  it("앞뒤 공백은 트림된다", () => {
    const result = SpaceCreateInputSchema.parse({ name: "  My Space  " });
    expect(result.name).toBe("My Space");
  });

  it("빈 이름은 거부", () => {
    expect(() => SpaceCreateInputSchema.parse({ name: "   " })).toThrow();
  });

  it("50자를 초과하면 거부", () => {
    expect(() =>
      SpaceCreateInputSchema.parse({ name: "a".repeat(51) }),
    ).toThrow();
  });

  it("50자는 허용", () => {
    const result = SpaceCreateInputSchema.parse({ name: "a".repeat(50) });
    expect(result.name).toHaveLength(50);
  });

  it("비가시/위장 문자만 있는 이름은 거부", () => {
    expect(() =>
      SpaceCreateInputSchema.parse({
        name: String.fromCharCode(0x200b, 0x200b, 0x200b),
      }),
    ).toThrow();
  });

  it("NFD로 인코딩된 이름은 NFC로 정규화되어 저장된다", () => {
    const nfd = "Cafe" + String.fromCharCode(0x0301); // "e" + combining acute
    const result = SpaceCreateInputSchema.parse({ name: nfd });
    expect(result.name).toBe("Caf" + String.fromCharCode(0x00e9));
  });
});
