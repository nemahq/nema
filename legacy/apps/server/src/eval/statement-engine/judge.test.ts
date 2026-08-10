import { describe, expect, it } from "vitest";

import { parseJsonObject } from "./judge";

// 심판 출력 파싱이 틀리면 매칭·품질 판정이 통째로 오염된다.
// 첫 측정에서 실제로 맞은 변형(JSON 뒤 사족)의 회귀 방지.

describe("parseJsonObject", () => {
  it("JSON 뒤에 사족이 붙어도 파싱한다 — 측정 #2에서 실제 발생한 변형", () => {
    expect(
      parseJsonObject(
        '{"same": false, "reason": "x"}\n\nWait, let me reconsider.',
      ),
    ).toEqual({ same: false, reason: "x" });
  });

  it("재고 후 두 번째 JSON을 내면 마지막 객체(최종 답)를 쓴다", () => {
    const text =
      '{"same": false, "reason": "a"} On reflection: {"same": true, "reason": "b"}';
    expect(parseJsonObject(text)["same"]).toBe(true);
  });

  it("중첩 중괄호를 하나의 객체로 읽는다", () => {
    expect(parseJsonObject('{"a": {"b": 1}}')).toEqual({ a: { b: 1 } });
  });

  it("파싱 가능한 JSON이 없으면 throw — 조용한 오판 대신 표면화", () => {
    expect(() => parseJsonObject("no json here")).toThrow();
    expect(() => parseJsonObject("{broken json}")).toThrow();
  });
});
