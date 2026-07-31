import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import {
  getChangesetByNumber,
  getPendingRelationByNumber,
} from "./changeset-detail-service";

vi.mock("@sentry/node", () => ({ captureException: vi.fn() }));

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
    digest_topics: [{ topic: { id: TOPIC_ID, title: "토픽" } }],
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
// reverted 조회(is_changeset_reverted RPC)는 status='closed'+outcome='applied'인
// changeset을 다룰 때만 탄다 — 기본값 false로 두면 그 케이스를 명시적으로 다루지
// 않는 기존 테스트들이 새로 깨지지 않는다. reverted를 검증하는 테스트는 이 기본값을
// override한다.
function mockSupabase(
  perTable: Record<string, Record<string, unknown>[]>,
  rpc: Record<string, unknown> = {},
): TypedSupabaseClient {
  return {
    rpc: vi.fn(async (fn: string) => ({
      data: fn in rpc ? rpc[fn] : false,
      error: null,
    })),
    from: vi.fn((table: string) => {
      const rows = perTable[table] ?? [];
      const filters: Record<string, unknown> = {};
      let orderBy: { col: string; ascending: boolean } | null = null;
      let limitN: number | null = null;
      function matched(): Record<string, unknown>[] {
        let result = rows.filter((r) => matchesFilters(r, filters));
        if (orderBy) {
          const { col, ascending } = orderBy;
          result = [...result].sort((a, b) => {
            const cmp = String(a[col]).localeCompare(String(b[col]));
            return ascending ? cmp : -cmp;
          });
        }
        if (limitN !== null) {
          result = result.slice(0, limitN);
        }
        return result;
      }
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
        order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
          orderBy = { col, ascending: opts?.ascending ?? true };
          return chain;
        }),
        limit: vi.fn((n: number) => {
          limitN = n;
          return chain;
        }),
        maybeSingle: vi.fn(async () => ({
          data: matched()[0] ?? null,
          error: null,
        })),
        single: vi.fn(async () => ({
          data: matched()[0] ?? null,
          error: null,
        })),
        then: vi.fn((resolve: (result: unknown) => unknown) =>
          resolve({ data: matched(), error: null }),
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
          status: "closed",
          outcome: "applied",
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
      topics: [{ id: TOPIC_ID, title: "토픽" }],
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
          status: "closed",
          outcome: "discarded",
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

    expect(result.body).toEqual({ kind: "ingestion_discarded" });
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
          status: "closed",
          outcome: "applied",
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
          status: "closed",
          outcome: "discarded",
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

    expect(result.body).toEqual({ kind: "relation_conflict_discarded" });
  });

  it("relation(중복) 적용됨 — keeper/duplicate 각각의 실제 status를 그대로 반영한다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-5",
          space_id: SPACE_ID,
          number: 5,
          type: "relation",
          status: "closed",
          outcome: "applied",
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
          status: "closed",
          outcome: "discarded",
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

    expect(result.body).toEqual({ kind: "relation_duplicate_discarded" });
  });

  it("revert — 스텁 본문 + 되돌려진 원본 changeset의 number를 함께 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: REVERT_ID,
          space_id: SPACE_ID,
          number: 7,
          type: "revert",
          status: "closed",
          outcome: "applied",
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

    expect(result.body).toEqual({
      kind: "revert",
      revertsNumber: 2,
      reopenShape: null,
    });
    expect(result.revertsId).toBe(ORIGINAL_ID);
    expect(result.revertsNumber).toBe(2);
  });

  it("확신 관계 자동 적용(supports 1건) — relations 배열에 담아 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-8",
          space_id: SPACE_ID,
          number: 8,
          type: "relation",
          status: "closed",
          outcome: "applied",
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
      statements: [
        {
          id: STATEMENT_A_ID,
          content: "A가 B를 뒷받침",
          status: "active",
          digest_id: DIGEST_A_ID,
        },
        {
          id: STATEMENT_B_ID,
          content: "B",
          status: "active",
          digest_id: DIGEST_B_ID,
        },
      ],
      digests: [digestRow(DIGEST_A_ID), digestRow(DIGEST_B_ID)],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 8,
    });

    expect(result.body.kind).toBe("relation_confident_applied");
    if (result.body.kind !== "relation_confident_applied") {
      throw new Error("unreachable");
    }
    expect(result.body.relations).toHaveLength(1);
    expect(result.body.relations[0].relationType).toBe("supports");
    expect(result.body.relations[0].from.statementStatus).toBe("active");
    expect(result.body.relations[0].to.statementStatus).toBe("active");
  });

  it("확신 관계 자동 적용(배치 N건) — apply_relation_changesets가 한 changeset에 성공한 관계마다 change 행을 쌓으므로 전부 relations에 담아야 한다(누락 회귀 가드)", async () => {
    const STATEMENT_C_ID = "88888888-8888-4888-8888-888888888888";
    const STATEMENT_D_ID = "99999999-9999-4999-8999-999999999999";
    const DIGEST_C_ID = "aaaaaaaa-1111-4111-8111-111111111111";
    const DIGEST_D_ID = "bbbbbbbb-2222-4222-8222-222222222222";

    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-12",
          space_id: SPACE_ID,
          number: 12,
          type: "relation",
          status: "closed",
          outcome: "applied",
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
              target_id: "rel-7",
              data: {
                type: "supports",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-8",
              data: {
                type: "replaces",
                from_id: STATEMENT_C_ID,
                to_id: STATEMENT_D_ID,
              },
            },
          ],
        },
      ],
      statements: [
        {
          id: STATEMENT_A_ID,
          content: "A가 B를 뒷받침",
          status: "active",
          digest_id: DIGEST_A_ID,
        },
        {
          id: STATEMENT_B_ID,
          content: "B",
          status: "active",
          digest_id: DIGEST_B_ID,
        },
        {
          id: STATEMENT_C_ID,
          content: "새 진술",
          status: "active",
          digest_id: DIGEST_C_ID,
        },
        {
          id: STATEMENT_D_ID,
          content: "지난 진술",
          status: "archived",
          digest_id: DIGEST_D_ID,
        },
      ],
      digests: [
        digestRow(DIGEST_A_ID),
        digestRow(DIGEST_B_ID),
        digestRow(DIGEST_C_ID),
        digestRow(DIGEST_D_ID),
      ],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 12,
    });

    expect(result.body.kind).toBe("relation_confident_applied");
    if (result.body.kind !== "relation_confident_applied") {
      throw new Error("unreachable");
    }
    expect(result.body.relations).toHaveLength(2);
    expect(result.body.relations.map((r) => r.relationType).sort()).toEqual([
      "replaces",
      "supports",
    ]);
    const replacesRelation = result.body.relations.find(
      (r) => r.relationType === "replaces",
    );
    expect(replacesRelation?.to.statementStatus).toBe("archived");
  });

  it("확신 관계 거절됨(낮은 확신도가 open으로 갔다가 reject됨) — unsupported가 아니라 discarded로 뭉갠다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-13",
          space_id: SPACE_ID,
          number: 13,
          type: "relation",
          status: "closed",
          outcome: "discarded",
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
              target_id: "rel-9",
              data: {
                type: "supports",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
      // 거절 시엔 내용을 조회하지 않는다 — 픽스처 부재가 회귀 가드(위 conflict 거절 테스트와 같은 원칙).
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 13,
    });

    expect(result.body).toEqual({ kind: "relation_confident_discarded" });
  });

  it("충돌 판정 완료 — 원래 conflicts 제안 행 뒤에 판정 결과 replaces 행이 추가돼도(행 순서 무관) 여전히 relation_conflict_applied로 렌더된다", async () => {
    // resolve_conflict_relation은 원래 conflicts 제안 change 행을 그대로 둔 채
    // 판정 결과 replaces change 행을 새로 추가한다 — 한 changeset에 relation
    // 행이 2개가 되고, PostgREST embed 순서는 보장되지 않는다. replaces 행을
    // 먼저 두어(order 의존 시 실패하도록) 순서 무관 동작을 검증한다.
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-14",
          space_id: SPACE_ID,
          number: 14,
          type: "relation",
          status: "closed",
          outcome: "applied",
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
              target_id: "rel-10",
              data: {
                type: "replaces",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
            {
              action: "create",
              target_type: "relation",
              target_id: "rel-11",
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
          content: "이긴 진술",
          status: "active",
          digest_id: DIGEST_A_ID,
        },
        {
          id: STATEMENT_B_ID,
          content: "진 진술",
          status: "archived",
          digest_id: DIGEST_B_ID,
        },
      ],
      digests: [digestRow(DIGEST_A_ID), digestRow(DIGEST_B_ID)],
    });

    const result = await getChangesetByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 14,
    });

    expect(result.body.kind).toBe("relation_conflict_applied");
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
          status: "closed",
          outcome: "applied",
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
          status: "closed",
          outcome: "applied",
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
          status: "closed",
          outcome: "applied",
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

  // author_*(내용을 만든 사람)와 closed_by_*(닫은 사람)에 서로 다른 값을 넣어, 반환 객체가
  // 그 둘을 엇갈려 매핑하지 않는지를 검증한다 — 실제 DB에서는 relation 타입이 author_id를
  // NULL로 강제하지만(chk_changeset_shape, ingestion은 이 제약 대상이 아니다), 이 테스트는
  // DB 제약이 아니라 서비스 계층의 컬럼→필드 매핑 로직만 겨냥한다(예: 리팩터 중
  // authorId: row.closed_by_id로 잘못 쓰는 실수가 나면 여기서 바로 잡힌다).
  it("authorId/authorName과 closedById/closedByName이 서로 다른 값으로 정확히 매핑된다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-11",
          space_id: SPACE_ID,
          number: 11,
          type: "ingestion",
          status: "closed",
          outcome: "applied",
          title: "제목",
          source_id: "src-11",
          reverts_id: null,
          author_id: "author-1",
          author_name: "작성자",
          closed_by_id: "reviewer-1",
          closed_by_name: "리뷰어",
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
      number: 11,
    });

    expect(result.authorId).toBe("author-1");
    expect(result.authorName).toBe("작성자");
    expect(result.closedById).toBe("reviewer-1");
    expect(result.closedByName).toBe("리뷰어");
  });

  // 되돌리기 버튼 노출 규칙(정책 결정 #26 규칙 4, 브레인 product-decisions/cross-cutting) — status='closed'+
  // outcome='applied'일 때만 reverted/revertedByNumber를 계산한다.
  describe("reverted/revertedByNumber", () => {
    function closedAppliedRow(overrides: Record<string, unknown> = {}) {
      return {
        id: "cs-20",
        space_id: SPACE_ID,
        number: 20,
        type: "ingestion",
        status: "closed",
        outcome: "applied",
        title: "제목",
        source_id: "src-20",
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
        ...overrides,
      };
    }

    it("closed+applied면 is_changeset_reverted RPC 결과를 reverted로 그대로 쓴다", async () => {
      const supabase = mockSupabase(
        { changesets: [closedAppliedRow()], digests: [digestRow(DIGEST_ID)] },
        { is_changeset_reverted: true },
      );

      const result = await getChangesetByNumber({
        supabase,
        spaceId: SPACE_ID,
        number: 20,
      });

      expect(result.reverted).toBe(true);
      expect(supabase.rpc).toHaveBeenCalledWith("is_changeset_reverted", {
        p_changeset_id: "cs-20",
      });
    });

    it("reverted=false면 revertedByNumber 조회 없이 null(자녀 찾을 이유가 없음)", async () => {
      const supabase = mockSupabase(
        { changesets: [closedAppliedRow()], digests: [digestRow(DIGEST_ID)] },
        { is_changeset_reverted: false },
      );

      const result = await getChangesetByNumber({
        supabase,
        spaceId: SPACE_ID,
        number: 20,
      });

      expect(result.reverted).toBe(false);
      expect(result.revertedByNumber).toBeNull();
    });

    it("재판정 초안이 아직 open이어도 그 number를 revertedByNumber로 돌려준다", async () => {
      const supabase = mockSupabase(
        {
          changesets: [
            closedAppliedRow(),
            {
              id: "cs-revert-20",
              reverts_id: "cs-20",
              status: "open",
              number: 21,
              created_at: "2026-07-02T00:00:00Z",
            },
          ],
          digests: [digestRow(DIGEST_ID)],
        },
        { is_changeset_reverted: true },
      );

      const result = await getChangesetByNumber({
        supabase,
        spaceId: SPACE_ID,
        number: 20,
      });

      expect(result.reverted).toBe(true);
      expect(result.revertedByNumber).toBe(21);
    });

    it("재판정이 이미 확정·버려졌어도(closed) revertedByNumber는 그대로 남는다 — 추적 링크는 상태 무관 영구", async () => {
      const supabase = mockSupabase(
        {
          changesets: [
            closedAppliedRow(),
            {
              id: "cs-revert-20",
              reverts_id: "cs-20",
              status: "closed",
              number: 21,
              created_at: "2026-07-02T00:00:00Z",
            },
          ],
          digests: [digestRow(DIGEST_ID)],
        },
        { is_changeset_reverted: true },
      );

      const result = await getChangesetByNumber({
        supabase,
        spaceId: SPACE_ID,
        number: 20,
      });

      expect(result.reverted).toBe(true);
      expect(result.revertedByNumber).toBe(21);
    });

    it("같은 원본을 토글 체인으로 여러 번 되돌린 경우 가장 최근 자녀만 가리킨다", async () => {
      const supabase = mockSupabase(
        {
          changesets: [
            closedAppliedRow(),
            {
              id: "cs-revert-20-old",
              reverts_id: "cs-20",
              status: "closed",
              number: 21,
              created_at: "2026-07-02T00:00:00Z",
            },
            {
              id: "cs-revert-20-new",
              reverts_id: "cs-20",
              status: "closed",
              number: 25,
              created_at: "2026-07-04T00:00:00Z",
            },
          ],
          digests: [digestRow(DIGEST_ID)],
        },
        { is_changeset_reverted: true },
      );

      const result = await getChangesetByNumber({
        supabase,
        spaceId: SPACE_ID,
        number: 20,
      });

      expect(result.revertedByNumber).toBe(25);
    });

    it("status='open'이면 되돌림 여부를 조회하지 않는다(버튼이 없는 화면)", async () => {
      const supabase = mockSupabase(
        {
          changesets: [
            {
              ...closedAppliedRow(),
              status: "open",
              outcome: null,
            },
          ],
        },
        { is_changeset_reverted: true },
      );

      await getChangesetByNumber({ supabase, spaceId: SPACE_ID, number: 20 });

      expect(supabase.rpc).not.toHaveBeenCalled();
    });
  });
});

describe("getPendingRelationByNumber", () => {
  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
  });

  it("conflicts open — A·B 스냅샷·sourceField/sourceFieldIndex를 돌려준다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-p1",
          space_id: SPACE_ID,
          number: 20,
          type: "relation",
          status: "open",
          source_id: "src-p1",
          created_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              target_type: "relation",
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
          source_field: "reason",
          source_field_index: null,
        },
        {
          id: STATEMENT_B_ID,
          content: "진술 B",
          status: "active",
          digest_id: DIGEST_B_ID,
          source_field: "tradeoff",
          source_field_index: 1,
        },
      ],
      digests: [digestRow(DIGEST_A_ID), digestRow(DIGEST_B_ID)],
    });

    const result = await getPendingRelationByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 20,
    });

    expect(result.changesetId).toBe("cs-p1");
    expect(result.changesetNumber).toBe(20);
    expect(result.body.kind).toBe("conflict_pending");
    if (result.body.kind !== "conflict_pending") {
      throw new Error("unreachable");
    }
    expect(result.body.from).toMatchObject({
      statementId: STATEMENT_A_ID,
      sourceField: "reason",
      sourceFieldIndex: null,
    });
    expect(result.body.to).toMatchObject({
      statementId: STATEMENT_B_ID,
      sourceField: "tradeoff",
      sourceFieldIndex: 1,
    });
  });

  it("duplicates open — keeper/duplicate 스냅샷과 함께 병합 초안을 돌려준다", async () => {
    const mergeDraft = {
      title: "병합 제목",
      description: "병합 설명",
      body: { type: "decision" },
      topics: [],
      tags: [],
      referenceIds: [],
      newReferenceKeys: [],
      externalUrls: [],
    };
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-p2",
          space_id: SPACE_ID,
          number: 21,
          type: "relation",
          status: "open",
          source_id: "src-p2",
          created_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              target_type: "relation",
              data: {
                type: "duplicates",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
                merge_draft: mergeDraft,
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
          source_field: "reason",
          source_field_index: null,
        },
        {
          id: STATEMENT_B_ID,
          content: "진술 B",
          status: "active",
          digest_id: DIGEST_B_ID,
          source_field: "tradeoff",
          source_field_index: 1,
        },
      ],
      digests: [digestRow(DIGEST_A_ID), digestRow(DIGEST_B_ID)],
    });

    const result = await getPendingRelationByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 21,
    });

    expect(result.body.kind).toBe("duplicate_pending");
    if (result.body.kind !== "duplicate_pending") {
      throw new Error("unreachable");
    }
    // 방향 규약: from=keeper, to=duplicate.
    expect(result.body.keeper.statementId).toBe(STATEMENT_A_ID);
    expect(result.body.duplicate.statementId).toBe(STATEMENT_B_ID);
    expect(result.body.mergeDraft).toEqual(mergeDraft);
  });

  it("duplicates open — 병합 초안 생성 실패(merge_draft 없음) — mergeDraft: null로 내려간다", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-p2b",
          space_id: SPACE_ID,
          number: 23,
          type: "relation",
          status: "open",
          source_id: "src-p2b",
          created_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              target_type: "relation",
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

    const result = await getPendingRelationByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 23,
    });

    expect(result.body.kind).toBe("duplicate_pending");
    if (result.body.kind !== "duplicate_pending") {
      throw new Error("unreachable");
    }
    expect(result.body.mergeDraft).toBeNull();
    // 키 자체가 없는(정상) 경우까지 보고하면 노이즈다 — 아래 "형식이 깨짐" 케이스만 보고돼야 한다.
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("duplicates open — merge_draft 키는 있는데 DigestDraftSchema 검증 실패(쓰기 쪽과 스키마 드리프트) — mergeDraft: null + Sentry 보고", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-p2c",
          space_id: SPACE_ID,
          number: 25,
          type: "relation",
          status: "open",
          source_id: "src-p2c",
          created_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              target_type: "relation",
              data: {
                type: "duplicates",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
                // title 누락 — DigestDraftSchema.min(1) 위반으로 안전하게 형식 깨짐을 재현.
                merge_draft: { description: "설명만 있음" },
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

    const result = await getPendingRelationByNumber({
      supabase,
      spaceId: SPACE_ID,
      number: 25,
    });

    expect(result.body.kind).toBe("duplicate_pending");
    if (result.body.kind !== "duplicate_pending") {
      throw new Error("unreachable");
    }
    expect(result.body.mergeDraft).toBeNull();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("supports open(낮은 확신도 확신 관계) — conflicts/duplicates 전용 화면이라 NOT_FOUND", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-p4",
          space_id: SPACE_ID,
          number: 24,
          type: "relation",
          status: "open",
          source_id: "src-p4",
          created_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              target_type: "relation",
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

    await expect(
      getPendingRelationByNumber({ supabase, spaceId: SPACE_ID, number: 24 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("closed(이미 판정됨) — NOT_FOUND", async () => {
    const supabase = mockSupabase({
      changesets: [
        {
          id: "cs-p3",
          space_id: SPACE_ID,
          number: 22,
          type: "relation",
          status: "closed",
          source_id: "src-p3",
          created_at: "2026-07-01T00:00:00Z",
          changes: [
            {
              target_type: "relation",
              data: {
                type: "conflicts",
                from_id: STATEMENT_A_ID,
                to_id: STATEMENT_B_ID,
              },
            },
          ],
        },
      ],
    });

    await expect(
      getPendingRelationByNumber({ supabase, spaceId: SPACE_ID, number: 22 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
