import { describe, expect, it, vi } from "vitest";

import type { Digest } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { saveStatements } from "@server/services/statement-service";

const FIELD_BY_TYPE: Record<Digest["type"], string> = {
  decision: "choice",
  pending: "question",
  learning: "finding",
  idea: "concept",
  assumption: "assumption",
};

function digestOf(args: {
  id: string;
  type: Digest["type"];
  primaryValue: string;
}): Digest {
  const { id, type, primaryValue } = args;
  return {
    id,
    type,
    title: "제목",
    body: { [FIELD_BY_TYPE[type]]: primaryValue },
    createdAt: "2026-08-11T00:00:00.000Z",
  } as Digest;
}

const STATEMENT_IDS = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
];

// insert에 넘긴 행을 그대로 반환한다 — 여러 다이제스트가 한 번에 들어와도 결과가
// 뒤섞이지 않는지 보려면 실제 인자를 반영해야 한다.
function fakeSupabase(): {
  client: TypedSupabaseClient;
  insert: ReturnType<typeof vi.fn>;
} {
  const insert = vi.fn().mockImplementation(
    (
      rows: Array<{
        digest_id: string;
        digest_field: string;
        content: string;
      }>,
    ) => ({
      select: vi.fn().mockResolvedValue({
        data: rows.map((row, i) => ({
          id: STATEMENT_IDS[i],
          digest_id: row.digest_id,
          digest_field: row.digest_field,
          content: row.content,
          created_at: "2026-08-11T00:00:01.000Z",
        })),
        error: null,
      }),
    }),
  );
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as TypedSupabaseClient, insert };
}

function fakeSupabaseWithInsertError(): TypedSupabaseClient {
  const from = vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "42501", message: "permission denied" },
      }),
    }),
  });
  return { from } as unknown as TypedSupabaseClient;
}

describe("saveStatements", () => {
  it.each([
    ["decision", "choice", "선택 내용"],
    ["pending", "question", "질문 내용"],
    ["learning", "finding", "발견 내용"],
    ["idea", "concept", "발상 내용"],
    ["assumption", "assumption", "가설 내용"],
  ] as const)(
    "%s의 진술 content는 주된 칸(%s) 값과 정확히 같다",
    async (type, field, primaryValue) => {
      const digest = digestOf({ id: STATEMENT_IDS[0], type, primaryValue });
      const { client } = fakeSupabase();

      const result = await saveStatements({
        supabase: client,
        digests: [digest],
      });

      const statement = result.get(digest.id);
      expect(statement?.content).toBe(primaryValue);
      expect(statement?.digestField).toBe(field);
    },
  );

  it("다이제스트 여러 개를 한 번의 insert로 저장한다", async () => {
    const digests = [
      digestOf({ id: STATEMENT_IDS[0], type: "decision", primaryValue: "A" }),
      digestOf({ id: STATEMENT_IDS[1], type: "learning", primaryValue: "B" }),
    ];
    const { client, insert } = fakeSupabase();

    const result = await saveStatements({ supabase: client, digests });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toHaveLength(2);
    expect(result.size).toBe(2);
  });

  it("저장이 실패해도 던지지 않고 빈 Map을 반환한다", async () => {
    const digest = digestOf({
      id: STATEMENT_IDS[0],
      type: "decision",
      primaryValue: "선택",
    });

    const result = await saveStatements({
      supabase: fakeSupabaseWithInsertError(),
      digests: [digest],
    });

    expect(result.size).toBe(0);
  });

  it("다이제스트가 없으면 insert를 호출하지 않는다", async () => {
    const { client, insert } = fakeSupabase();

    const result = await saveStatements({ supabase: client, digests: [] });

    expect(insert).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
