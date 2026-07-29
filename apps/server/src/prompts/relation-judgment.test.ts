import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";

import { RelationJudgmentSchema } from "./relation-judgment";

describe("RelationJudgmentSchema — OpenAI strict 구조화 출력 호환", () => {
  // OpenAI strict 모드는 모든 속성이 required이길 요구해 .optional() 필드가 있으면
  // zodTextFormat이 API 호출 전에 즉시 throw한다(openai@6, "not supported by the API").
  // 이 스키마의 conflictTitle처럼 값이 없을 수 있는 필드는 반드시 .nullable()이어야
  // 한다 — 이 테스트는 그 제약 위반을 타입체크·다른 유닛 테스트로는 못 잡는 걸 막는다
  // (기존 openai-provider.test.ts는 zodTextFormat 자체를 mock해 이 경로를 안 탄다).
  it("zodTextFormat 변환이 throw하지 않는다", () => {
    expect(() =>
      zodTextFormat(RelationJudgmentSchema, "relation_judgment"),
    ).not.toThrow();
  });
});
