import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { getChangesetByNumber } from "./changeset-detail-service";

const SPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIGEST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOPIC_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TAG_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REFERENCE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STATEMENT_A_ID = "11111111-1111-4111-8111-111111111111";
const STATEMENT_B_ID = "22222222-2222-4222-8222-222222222222";
const DIGEST_A_ID = "33333333-3333-4333-8333-333333333333";
const DIGEST_B_ID = "44444444-4444-4444-8444-444444444444";
const REVERT_ID = "55555555-5555-4555-8555-555555555555";
const ORIGINAL_ID = "66666666-6666-4666-8666-666666666666";

function digestRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `제목-${id}`,
    description: "설명",
    body: { type: "decision" },
    external_urls: ["https://example.com"],
    author_id: null,
    status: "active",
    created_at: "2026-07-01T00:00:00Z",
    digest_topics: [{ topic: { id: TOPIC_ID, name: "토픽" } }],
    digest_tags: [
      { tag: { id: TAG_ID, title: "태그", description: "태그 설명" } },
    ],
    digest_references: [{ reference_id: REFERENCE_ID }],
    ...overrides,
  };
}

function matchesFilters(
  row: Record<string, unknown>,
  filters: Record<string, unknown>,
): boolean {
  return Object.entries(filters).every(([col, val]) => {
    if (val !== null && typeof val === "object" && "$in" in val) {
      return (val as { $in: unknown[] }).$in.includes(row[col]);
    }
    return row[col] === val;
  });
}

// 테이블명 → 필터(eq/in 누적) 매칭만 지원하는 범용 mock — 이 서비스가 changesets를
// 두 번(본문 조회 + reverts_id 번호 조회) 서로 다른 조건으로, digests/statements를
// 조건별로 여러 번 호출하므로 호출 순서 고정 mock 대신 조건 매칭 mock이 맞다.
function mockSupabase(
  perTable: Record<string, Record<string, unknown>[]>,
): TypedSupabaseClient {
  return {
    from: vi.fn((table: string) => {
      const rows = perTable[table] ?? [];
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {
        select: vi.fn(() => chain),
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        }),
        in: vi.fn((col: string, vals: unknown[]) => {
          filters[col] = { $in: vals };
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({
          data: rows.find((r) => matchesFilters(r, filters)) ?? null,
          error: null,
        })),
        single: vi.fn(async () => ({
          data: rows.find((r) => matchesFilters(r, filters)) ?? null,
          error: null,
        })),
        then: vi.fn((resolve: (result: unknown) => unknown) =>
          resolve({
            data: rows.filter((r) => matchesFilters(r, filters)),
            error: null,
          }),
        ),
      };
      return chain;
    }),
  } as unknown as TypedSupabaseClient;
}

describe("getChangesetByNumber", () => {
  it("ingestion 적용됨 — 생성된 Digest 스냅샷 목록을 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-1",
          space_id: SPACE_ID,
          number: 1,
          type: "ingestion",
          status: "applied",
          title: "제목",
          source_id: "src-1",
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "digest",
              target_id: DIGEST_ID,
              data: null,
            },
          ],
        },
      ],
      digests: [digestRow(DIGEST_ID)],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 1,
    });

    expect(result.body.kind).toBe("ingestion_applied");
    if (result.body.kind !== "ingestion_applied") {
      throw new Error("unreachable");
    }
    expect(result.body.digests).toHaveLength(1);
    expect(result.body.digests[0]).toMatchObject({
      id: DIGEST_ID,
      topics: [{ id: TOPIC_ID, name: "토픽" }],
      tags: [{ id: TAG_ID, title: "태그", description: "태그 설명" }],
      referenceIds: [REFERENCE_ID],
    });
  });

  it("ingestion 버려짐 — 아무것도 생성되지 않았다는 것만 표시한다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-2",
          space_id: SPACE_ID,
          number: 2,
          type: "ingestion",
          status: "rejected",
          title: null,
          source_id: "src-2",
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [],
        },
      ],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 2,
    });

    expect(result.body).toEqual({ kind: "ingestion_rejected" });
    expect(result.sourceId).toBe("src-2");
  });

  it("relation(충돌) 적용됨 — 두 진술 각각의 Digest 스냅샷을 함께 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-3",
          space_id: SPACE_ID,
          number: 3,
          type: "relation",
          status: "applied",
          title: "A vs B",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-1",
              data: {
                type: "conflicts",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
      statements: [
        {
          id: STATEMENT_A_ID,
          content: "진술 A",
          status: "active",
          digest_id: DIGEST_A_ID,
        },
        {
          id: STATEMENT_B_ID,
          content: "진술 B",
          status: "active",
          digest_id: DIGEST_B_ID,
        },
      ],
      digests: [digestRow(DIGEST_A_ID), digestRow(DIGEST_B_ID)],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 3,
    });

    expect(result.body.kind).toBe("relation_conflict_applied");
    if (result.body.kind !== "relation_conflict_applied") {
      throw new Error("unreachable");
    }
    expect(result.body.from.statementId).toBe(STATEMENT_A_ID);
    expect(result.body.from.digest.id).toBe(DIGEST_A_ID);
    expect(result.body.to.statementId).toBe(STATEMENT_B_ID);
    expect(result.body.to.digest.id).toBe(DIGEST_B_ID);
  });

  it("relation(충돌) 버려짐 — 둘 다 유지됐다는 안내만, 내용 조회는 안 한다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-4",
          space_id: SPACE_ID,
          number: 4,
          type: "relation",
          status: "rejected",
          title: "A vs B",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-2",
              data: {
                type: "conflicts",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
      // statements/digests 픽스처를 일부러 안 넣는다 — 거절 케이스가 실수로 내용을
      // 더 조회하려 하면 statement/digest를 못 찾아 던지므로, 이 테스트 통과 자체가
      // "거절 시엔 콘텐츠를 조회하지 않는다"는 회귀 가드다.
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 4,
    });

    expect(result.body).toEqual({ kind: "relation_conflict_rejected" });
  });

  it("relation(중복) 적용됨 — keeper/duplicate 각각의 실제 status를 그대로 반영한다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-5",
          space_id: SPACE_ID,
          number: 5,
          type: "relation",
          status: "applied",
          title: "병합 제목",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-3",
              data: {
                type: "duplicates",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
      statements: [
        {
          id: STATEMENT_A_ID,
          content: "keeper",
          status: "active",
          digest_id: DIGEST_A_ID,
        },
        {
          id: STATEMENT_B_ID,
          content: "duplicate",
          status: "archived",
          digest_id: DIGEST_B_ID,
        },
      ],
      digests: [digestRow(DIGEST_A_ID), digestRow(DIGEST_B_ID)],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 5,
    });

    expect(result.body.kind).toBe("relation_duplicate_applied");
    if (result.body.kind !== "relation_duplicate_applied") {
      throw new Error("unreachable");
    }
    expect(result.body.keeper.statementId).toBe(STATEMENT_A_ID);
    expect(result.body.keeper.statementStatus).toBe("active");
    expect(result.body.duplicate.statementId).toBe(STATEMENT_B_ID);
    expect(result.body.duplicate.statementStatus).toBe("archived");
  });

  it("relation(중복) 버려짐 — 둘 다 유지됐다는 안내만 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-6",
          space_id: SPACE_ID,
          number: 6,
          type: "relation",
          status: "rejected",
          title: "제목",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-4",
              data: {
                type: "duplicates",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 6,
    });

    expect(result.body).toEqual({ kind: "relation_duplicate_rejected" });
  });

  it("revert — 스텁 본문 + 되돌려진 원본 changeset의 number를 함께 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: REVERT_ID,
          space_id: SPACE_ID,
          number: 7,
          type: "revert",
          status: "applied",
          title: "원본 제목 되돌림",
          source_id: null,
          reverts_id: ORIGINAL_ID,
          author_id: "user-1",
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [],
        },
        { id: ORIGINAL_ID, number: 2 },
      ],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 7,
    });

    expect(result.body).toEqual({ kind: "revert" });
    expect(result.revertsId).toBe(ORIGINAL_ID);
    expect(result.revertsNumber).toBe(2);
  });

  it("확신 관계 자동 적용(conflicts/duplicates가 아닌 relation) — 크래시 없이 unsupported로 폴백", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-8",
          space_id: SPACE_ID,
          number: 8,
          type: "relation",
          status: "applied",
          title: "제목",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-5",
              data: {
                type: "supports",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 8,
    });

    expect(result.body).toEqual({ kind: "unsupported" });
  });

  it("존재하지 않는 번호 — SupabaseError(not_found)를 던진다(원문 메시지가 그대로 새지 않게)", async () => {
    const supabase = mockSupabase({ changesets: [] });

    await expect(
      getChangesetByNumber({ supabase, spaceId: SPACE_ID, number: 999 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("다른 Space에 같은 number가 있어도 이 Space 스코프에선 안 보인다(크로스 스페이스 유출 방지)", async () => {
    const OTHER_SPACE_ID = "77777777-7777-4777-8777-777777777777";
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-other-space",
          space_id: OTHER_SPACE_ID,
          number: 1,
          type: "ingestion",
          status: "applied",
          title: "다른 Space의 changeset",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [],
        },
      ],
    });

    await expect(
      getChangesetByNumber({ supabase, spaceId: SPACE_ID, number: 1 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("ingestion 적용됨인데 생성된 digest가 실제로는 없음(참조 무결성 위반) — 원문 메시지 노출 없이 SupabaseError로 던진다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-9",
          space_id: SPACE_ID,
          number: 9,
          type: "ingestion",
          status: "applied",
          title: "제목",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              action: "create",
              target_type: "digest",
              target_id: DIGEST_ID,
              data: null,
            },
          ],
        },
      ],
      // digests 픽스처를 일부러 비워둔다 — 배치 purge 등으로 참조된 digest가
      // 실제로 하드 삭제된 상황을 재현.
    });

    await expect(
      getChangesetByNumber({ supabase, spaceId: SPACE_ID, number: 9 }),
    ).rejects.toMatchObject({ code: "query_failed" });
  });

  it("relation changeset인데 relation change row 자체가 없음(불변식 위반) — unsupported로 뭉개지 않고 던진다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-10",
          space_id: SPACE_ID,
          number: 10,
          type: "relation",
          status: "applied",
          title: "제목",
          source_id: null,
          reverts_id: null,
          author_id: null,
          created_at: "2026-07-01T00:00:00Z",
          updated_at: "2026-07-01T00:00:00Z",
          changes: [], // relation 타입 change가 없음 — 정상 경로에선 불가능한 상태
        },
      ],
    });

    await expect(
      getChangesetByNumber({ supabase, spaceId: SPACE_ID, number: 10 }),
    ).rejects.toMatchObject({ code: "query_failed" });
  });
});
