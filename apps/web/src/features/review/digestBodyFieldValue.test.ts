import { describe, expect, it } from "vitest";

import {
  isDigestBodyFieldBlank,
  readDigestBodyFieldValue,
  resolveCommittedValue,
} from "./digestBodyFieldValue";

describe("resolveCommittedValue", () => {
  it("undefined면 text 자리를 깐다", () => {
    expect(resolveCommittedValue(undefined, "text")).toBe("");
  });

  it("undefined면 list 자리를 깐다", () => {
    expect(resolveCommittedValue(undefined, "list")).toEqual([""]);
  });

  it("빈 배열이면 list 자리를 깐다", () => {
    expect(resolveCommittedValue([], "list")).toEqual([""]);
  });

  // 이미 자리(항목)가 있으면 공백뿐이어도 모양을 바꾸지 않는다 — 바꾸면 이 값을
  // 커밋한 useDraftField가 다음 렌더에서 자기 자신의 커밋을 외부 변경으로 오판해
  // 그 사이 타이핑을 덮어쓴다.
  it("공백뿐인 문자열은 그대로 돌려준다", () => {
    expect(resolveCommittedValue("   ", "text")).toBe("   ");
  });

  it("항목이 전부 공백인 배열은 항목 수를 그대로 유지한다", () => {
    expect(resolveCommittedValue(["", ""], "list")).toEqual(["", ""]);
  });

  it("실제 내용이 있으면 그대로 돌려준다", () => {
    expect(resolveCommittedValue("내용", "text")).toBe("내용");
    expect(resolveCommittedValue(["a", "b"], "list")).toEqual(["a", "b"]);
  });
});

describe("readDigestBodyFieldValue", () => {
  it("body.type과 맞는 필드는 그 값을 그대로 돌려준다", () => {
    const body = {
      type: "decision" as const,
      situation: "상황",
      tradeoff: ["a"],
    };
    expect(readDigestBodyFieldValue(body, "situation")).toBe("상황");
    expect(readDigestBodyFieldValue(body, "tradeoff")).toEqual(["a"]);
  });

  it("body에 없는 필드(다른 타입 전용)는 undefined다", () => {
    const body = { type: "decision" as const, situation: "상황" };
    expect(readDigestBodyFieldValue(body, "finding")).toBeUndefined();
  });
});

describe("isDigestBodyFieldBlank", () => {
  it("빈 문자열·공백만 있는 문자열은 blank다", () => {
    expect(isDigestBodyFieldBlank("")).toBe(true);
    expect(isDigestBodyFieldBlank("   ")).toBe(true);
    expect(isDigestBodyFieldBlank("내용")).toBe(false);
  });

  it("항목이 전부 공백인 리스트는 blank다 — length만 보면 오판한다", () => {
    expect(isDigestBodyFieldBlank([""])).toBe(true);
    expect(isDigestBodyFieldBlank(["", ""])).toBe(true);
    expect(isDigestBodyFieldBlank(["a"])).toBe(false);
  });
});
