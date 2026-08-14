import { describe, expect, it } from "vitest";

import { DIGEST_RELATION_TYPES } from "@nema-io/shared";

import {
  RELATION_JUDGMENTS,
  relationTypesOf,
} from "@server/services/relation-rules";

// 갈래가 늘어날 때 조용히 어긋나는 두 자리를 잡는다. 둘 다 컴파일러가 못 보고,
// 흐름 테스트에도 안 걸린다 — 아무 일도 안 일어나거나, 일어나긴 하는데 엉뚱하게
// 일어나는 모양이라 실패가 화면에 안 뜬다.
describe("갈래 등록", () => {
  it("모든 관계 종류가 정확히 한 갈래에 속한다", () => {
    const owners = new Map(
      DIGEST_RELATION_TYPES.map((type) => [
        type,
        RELATION_JUDGMENTS.filter((judgment) =>
          relationTypesOf(judgment).includes(type),
        ).map((judgment) => judgment.name),
      ]),
    );

    // 0개 = 표는 만들었는데 RELATION_JUDGMENTS 등록을 잊었다(그 종류는 영영 안 붙는다).
    // 2개 이상 = 두 갈래가 같은 종류를 낸다. 한 쌍에 관계는 하나뿐이라 판정 순서가
    // 승자를 정하게 되는데, 그 자리가 결정↔결정 밖으로 번진다.
    expect(Object.fromEntries(owners)).toEqual({
      support: ["support_weaken"],
      weaken: ["support_weaken"],
      duplicate: ["duplicate_conflict"],
      conflict: ["duplicate_conflict"],
    });
  });
});
