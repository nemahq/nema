import { describe, expect, it } from "vitest";

import { TimeTokenSchema } from "./token";

// 구조화 레이어가 generateStructured로 토큰을 뱉는 경로의 안전망 — 형식만 맞고 실재하지
// 않는 날짜(LLM이 흔히 내는 오류)를 parse 단계에서 거르는지. resolver 가드와는 진입점이 다르다.
describe("TimeTokenSchema — absolute date 검증", () => {
  it("실재하는 날짜는 통과한다", () => {
    const parsed = TimeTokenSchema.safeParse({
      field: "due",
      boundary: "within",
      anchor: { kind: "absolute", date: "2026-02-14" },
    });
    expect(parsed.success).toBe(true);
  });

  it("형식은 맞지만 존재하지 않는 날짜(2026-02-30)는 거부한다", () => {
    const parsed = TimeTokenSchema.safeParse({
      field: "due",
      boundary: "within",
      anchor: { kind: "absolute", date: "2026-02-30" },
    });
    expect(parsed.success).toBe(false);
  });
});
