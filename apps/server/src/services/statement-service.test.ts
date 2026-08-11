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

function decisionDigest(id: string, choice = "선택"): Digest {
  return {
    id,
    type: "decision",
    title: "제목",
    body: { choice },
    createdAt: "2026-08-11T00:00:00.000Z",
  };
}

// insert가 불린 그대로(digest_id·content)를 담은 행을 돌려준다 — 여러 다이제스트가
// 섞여 들어와도 결과가 뒤섞이지 않는지 보려면 실제 인자를 반영해야 한다.
function fakeSupabase(): TypedSupabaseClient {
  const from = vi.fn().mockImplementation(() => ({
    insert: vi
      .fn()
      .mockImplementation((row: { digest_id: string; content: string }) => ({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: "22222222-2222-4222-8222-222222222222",
              digest_id: row.digest_id,
              digest_field: "choice",
              content: row.content,
              created_at: "2026-08-11T00:00:01.000Z",
            },
            error: null,
          }),
        }),
      })),
  }));
  return { from } as unknown as TypedSupabaseClient;
}

const DIGEST_ID_A = "11111111-1111-4111-8111-111111111111";
const DIGEST_ID_B = "33333333-3333-4333-8333-333333333333";

describe("generateAndSaveStatements retry", () => {
  it("재시도해도 결과가 같은 오류(auth)는 한 번만 시도하고 포기한다", async () => {
    mockGenerateStructured = vi
      .fn()
      .mockRejectedValue(new LlmError("auth", "no access"));

    const result = await generateAndSaveStatements({
      supabase: fakeSupabase(),
      digests: [decisionDigest(DIGEST_ID_A)],
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
      digests: [decisionDigest(DIGEST_ID_A)],
    });

    expect(mockGenerateStructured).toHaveBeenCalledTimes(3);
    expect(result.size).toBe(0);
  });

  it("재시도 끝에 성공하면 그 결과를 저장한다", async () => {
    mockGenerateStructured = vi
      .fn()
      .mockRejectedValueOnce(new LlmError("rate_limit", "too many requests"))
      .mockResolvedValueOnce({ statement: "생성된 문장" });

    const digest = decisionDigest(DIGEST_ID_A);
    const result = await generateAndSaveStatements({
      supabase: fakeSupabase(),
      digests: [digest],
    });

    expect(mockGenerateStructured).toHaveBeenCalledTimes(2);
    expect(result.get(digest.id)?.content).toBe("생성된 문장");
  });
});

describe("generateAndSaveStatements 병렬 격리", () => {
  // 이 PR의 핵심 주장 — "다이제스트끼리 참조하지 않으므로 병렬로 돌리고, 하나가
  // 실패해도 나머지는 산다"(linking.md 2.2) — 를 실제로 검증한다. Promise.all을
  // Promise.allSettled로 바꾸거나 결과 배열의 인덱스 매칭이 깨지는 회귀를 잡는다.
  it("A가 실패하고 B가 성공하면 B의 진술만 올바른 키로 저장된다", async () => {
    mockGenerateStructured = vi
      .fn()
      .mockImplementation((params: { messages: [{ content: string }] }) => {
        const isDigestA = params.messages[0].content.includes("A의 선택");
        return isDigestA
          ? Promise.reject(new LlmError("auth", "no access"))
          : Promise.resolve({ statement: "B의 문장" });
      });

    const result = await generateAndSaveStatements({
      supabase: fakeSupabase(),
      digests: [
        decisionDigest(DIGEST_ID_A, "A의 선택"),
        decisionDigest(DIGEST_ID_B, "B의 선택"),
      ],
    });

    expect(result.size).toBe(1);
    expect(result.has(DIGEST_ID_A)).toBe(false);
    expect(result.get(DIGEST_ID_B)?.content).toBe("B의 문장");
    expect(result.get(DIGEST_ID_B)?.digestId).toBe(DIGEST_ID_B);
  });
});
