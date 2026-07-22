import { describe, expect, it } from "vitest";

import { mergeListItemIntoPrevious, splitListItem } from "./digestListEditing";

describe("splitListItem", () => {
  it("커서 위치(start===end)에서 항목을 둘로 쪼갠다", () => {
    expect(splitListItem(["hello"], 0, 2, 2)).toEqual(["he", "llo"]);
  });

  it("선택 영역(start<end)이 있으면 그 구간을 지우고 쪼갠다", () => {
    // start만 커서로 취급하면 "h"/"hello"가 나온다 — 선택돼 있던 "ell"이
    // 지워지지 않고 다음 줄로 통째로 넘어가는 회귀를 여기서 잡는다.
    expect(splitListItem(["hello"], 0, 1, 4)).toEqual(["h", "o"]);
  });

  it("여러 항목 중 가운데 항목만 쪼개고 나머지는 그대로 둔다", () => {
    expect(splitListItem(["a", "hello", "b"], 1, 2, 2)).toEqual([
      "a",
      "he",
      "llo",
      "b",
    ]);
  });
});

describe("mergeListItemIntoPrevious", () => {
  it("항목을 앞 항목 끝에 이어붙이고 자기 자리는 없앤다", () => {
    expect(mergeListItemIntoPrevious(["foo", "bar"], 1)).toEqual(["foobar"]);
  });

  it("가운데 항목을 앞으로 합쳐도 나머지 항목은 그대로 둔다", () => {
    expect(mergeListItemIntoPrevious(["a", "b", "c"], 1)).toEqual(["ab", "c"]);
  });
});
