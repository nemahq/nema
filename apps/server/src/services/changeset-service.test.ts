import { describe, expect, it } from "vitest";

import { buildRevertedPredicate } from "@server/services/changeset-service";

// "되돌림 여부" 재귀(§4.4)는 단순 카운트가 아니라 redo·분기에서 갈린다 —
// 이 술어가 틀리면 이력의 되돌림 표시와 멱등 가드가 함께 어긋난다.
describe("buildRevertedPredicate", () => {
  it("미되돌림 변경셋은 false", () => {
    const isReverted = buildRevertedPredicate([]);
    expect(isReverted("C")).toBe(false);
  });

  it("revert가 가리키면 대상은 reverted, revert 자신은 아님", () => {
    // C ← R1
    const isReverted = buildRevertedPredicate([{ id: "R1", revertsId: "C" }]);
    expect(isReverted("C")).toBe(true);
    expect(isReverted("R1")).toBe(false);
  });

  it("redo(revert의 revert)면 원 대상이 다시 in-effect", () => {
    // C ← R1 ← R2  (R2 = redo)
    const isReverted = buildRevertedPredicate([
      { id: "R1", revertsId: "C" },
      { id: "R2", revertsId: "R1" },
    ]);
    expect(isReverted("C")).toBe(false); // R1이 되돌려져 C의 유효 revert가 없음
    expect(isReverted("R1")).toBe(true);
    expect(isReverted("R2")).toBe(false);
  });

  it("redo 후 같은 대상을 다시 revert하면 분기 — 유효 revert가 있으니 reverted", () => {
    // C ← R1 (R1 ← R2),  C ← R3   → C는 R3(유효)로 다시 되돌려짐
    const isReverted = buildRevertedPredicate([
      { id: "R1", revertsId: "C" },
      { id: "R2", revertsId: "R1" },
      { id: "R3", revertsId: "C" },
    ]);
    expect(isReverted("C")).toBe(true); // R1은 무효지만 R3가 유효
    expect(isReverted("R1")).toBe(true);
    expect(isReverted("R3")).toBe(false);
  });

  it("두 단계 redo는 다시 reverted로 토글", () => {
    // C ← R1 ← R2 ← R3  → R1 다시 유효 → C reverted
    const isReverted = buildRevertedPredicate([
      { id: "R1", revertsId: "C" },
      { id: "R2", revertsId: "R1" },
      { id: "R3", revertsId: "R2" },
    ]);
    expect(isReverted("C")).toBe(true);
    expect(isReverted("R1")).toBe(false);
    expect(isReverted("R2")).toBe(true);
  });
});
