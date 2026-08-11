import { describe, expect, it, vi } from "vitest";

import type { Digest } from "@nema-io/shared";

import { LlmError } from "@server/infra/llm/llm-error";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { generateAndSaveStatements } from "@server/services/statement-service";

let mockGenerateStructured: ReturnType<typeof vi.fn>;
vi.mock("@server/infra/llm/provider", () => ({
  getStatementGenerationProvider: () => ({
    generateStructured: mockGenerateStructured,
  }),
}));

function decisionDigest(): Digest {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "decision",
    title: "제목",
    body: { choice: "선택" },
    createdAt: "2026-08-11T00:00:00.000Z",
  };
}

function fakeSupabase(): TypedSupabaseClient {
  const insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          id: "22222222-2222-4222-8222-222222222222",
          digest_id: decisionDigest().id,
          digest_field: "choice",
          content: "생성된 문장",
          created_at: "2026-08-11T00:00:01.000Z",
        },
        error: null,
      }),
    }),
  });
  return {
    from: vi.fn().mockReturnValue({ insert }),
  } as unknown as TypedSupabaseClient;
}

describe("generateAndSaveStatements retry", () => {
  it("재시도해도 결과가 같은 오류(auth)는 한 번만 시도하고 포기한다", async () => {
    mockGenerateStructured = vi
      .fn()
      .mockRejectedValue(new LlmError("auth", "no access"));

    const result = await generateAndSaveStatements({
      supabase: fakeSupabase(),
      digests: [decisionDigest()],
    });

    expect(mockGenerateStructured).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(0);
  });

  it("일시적 오류(rate_limit)는 상한까지 다시 시도한다", async () => {
    mockGenerateStructured = vi
      .fn()
      .mockRejectedValue(new LlmError("rate_limit", "too many requests"));

    const result = await generateAndSaveStatements({
      supabase: fakeSupabase(),
      digests: [decisionDigest()],
    });

    expect(mockGenerateStructured).toHaveBeenCalledTimes(3);
    expect(result.size).toBe(0);
  });

  it("재시도 끝에 성공하면 그 결과를 저장한다", async () => {
    mockGenerateStructured = vi
      .fn()
      .mockRejectedValueOnce(new LlmError("rate_limit", "too many requests"))
      .mockResolvedValueOnce({ statement: "생성된 문장" });

    const digest = decisionDigest();
    const result = await generateAndSaveStatements({
      supabase: fakeSupabase(),
      digests: [digest],
    });

    expect(mockGenerateStructured).toHaveBeenCalledTimes(2);
    expect(result.get(digest.id)?.content).toBe("생성된 문장");
  });
});
