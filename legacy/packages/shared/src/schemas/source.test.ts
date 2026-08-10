import { describe, expect, it } from "vitest";

import { SOURCE_BODY_MAX_LENGTH, SourceCreateInputSchema } from "./source";

// 원문 입구 상한 — 비정상 큰 글을 박제 전에 거부한다(추출·임베딩·잇기 폭주 차단).
describe("SourceCreateInputSchema", () => {
  it("상한 길이의 본문은 통과", () => {
    const body = "가".repeat(SOURCE_BODY_MAX_LENGTH);
    expect(SourceCreateInputSchema.safeParse({ body }).success).toBe(true);
  });

  it("상한을 넘는 본문은 거부 — 쪼개서 다시 넣게", () => {
    const body = "가".repeat(SOURCE_BODY_MAX_LENGTH + 1);
    expect(SourceCreateInputSchema.safeParse({ body }).success).toBe(false);
  });

  it("빈 본문은 여전히 거부 (min)", () => {
    expect(SourceCreateInputSchema.safeParse({ body: "" }).success).toBe(false);
  });
});
