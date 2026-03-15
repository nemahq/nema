import { describe, expect, it } from "vitest";

import { MessageSchema, STATUS_LOG_TYPES } from "./message";

const base = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  role: "assistant" as const,
  createdAt: "2026-03-15T00:00:00.000Z",
};

describe("MessageSchema discriminated union", () => {
  it("type: text — 임의 문자열 content 허용", () => {
    const result = MessageSchema.parse({
      ...base,
      type: "text",
      content: "안녕하세요",
    });
    expect(result.type).toBe("text");
  });

  it("type: draft — 임의 문자열 content 허용", () => {
    const result = MessageSchema.parse({
      ...base,
      type: "draft",
      content: "초안 본문",
    });
    expect(result.type).toBe("draft");
  });

  it("type: status — StatusLogType 값 허용", () => {
    for (const code of Object.values(STATUS_LOG_TYPES)) {
      const result = MessageSchema.parse({
        ...base,
        type: "status",
        content: code,
      });
      expect(result.content).toBe(code);
    }
  });

  it("type: status — 유효하지 않은 content 거부", () => {
    expect(() =>
      MessageSchema.parse({
        ...base,
        type: "status",
        content: "invalid_code",
      }),
    ).toThrow();
  });
});
