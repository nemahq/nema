import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  buildRevertedPredicate,
  listChangesets,
  resolveDuplicateRelation,
  revertChangeset,
} from "@server/services/changeset-service";

// resolveDuplicateRelation은 as unknown as Json으로 나가는 객체 리터럴이라 키
// 오타를 타입체크가 못 잡는다(digest-review-service.test.ts의 같은 목적 테스트와
// 동일 이유) — RPC 계약 키(snake_case)를 고정한다.
describe("resolveDuplicateRelation", () => {
  it("mergedDigest·newReferences를 RPC 계약 키(snake_case)로 실어 보낸다", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: "new-digest-id", error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    const result = await resolveDuplicateRelation({
      supabase,
      changesetId: "changeset-1",
      mergedDigest: {
        title: "병합된 다이제스트",
        description: "설명",
        body: { type: "decision" },
        topics: [{ id: null, title: "새 주제" }],
        tags: [{ id: null, title: "새 태그", description: "정의" }],
        referenceIds: ["ref-1"],
        newReferenceKeys: ["new-ref-key"],
        externalUrls: ["https://example.com"],
      },
      newReferences: [
        {
          key: "new-ref-key",
          type: "product",
          title: "토스",
          body: "송금 앱",
          externalUrls: ["https://toss.im"],
        },
      ],
    });

    expect(rpc).toHaveBeenCalledWith("resolve_duplicate_relation", {
      p_changeset_id: "changeset-1",
      p_merged_digest: {
        title: "병합된 다이제스트",
        description: "설명",
        body: { type: "decision" },
        topics: ["새 주제"],
        tags: [{ title: "새 태그", description: "정의" }],
        reference_ids: ["ref-1"],
        new_reference_keys: ["new-ref-key"],
        external_urls: ["https://example.com"],
      },
      p_new_references: [
        {
          key: "new-ref-key",
          type: "product",
          title: "토스",
          body: "송금 앱",
          external_urls: ["https://toss.im"],
        },
      ],
    });
    expect(result).toEqual({ digestId: "new-digest-id" });
  });
});

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

  it("자식이 둘인데 둘 다 되돌려졌으면 부모는 in-effect (OR-fold, some 극성)", () => {
    // C ← R1(R1←R2), C ← R3(R3←R4)  → R1·R3 모두 무효 → C의 유효 revert 없음 → false.
    // some/every 혼동이나 단축평가 극성이 뒤집히면 여기서만 깨진다.
    const isReverted = buildRevertedPredicate([
      { id: "R1", revertsId: "C" },
      { id: "R2", revertsId: "R1" },
      { id: "R3", revertsId: "C" },
      { id: "R4", revertsId: "R3" },
    ]);
    expect(isReverted("C")).toBe(false);
    expect(isReverted("R1")).toBe(true);
    expect(isReverted("R3")).toBe(true);
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

function makeChangesetRow(number: number) {
  return {
    id: `cs-${number}`,
    number,
    type: "ingestion" as const,
    status: "open" as const,
    outcome: null,
    source_id: null,
    reverts_id: null,
    created_at: "2026-01-01T00:00:00Z",
    changes: [],
    sources: null,
  };
}

// listChangesets는 페이지 쿼리(changesets)와 되돌림 계산용 간선 쿼리(changesets)를
// 이 순서로 두 번 호출한다 — from()이 매번 새 체인을 반환해야 각 쿼리에 걸린
// select/eq/in/lt 호출을 서로 섞이지 않게 검증할 수 있다.
function mockSupabaseSequence(
  resolvedList: { data?: unknown; error?: unknown }[],
) {
  const chains = resolvedList.map((resolved) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.neq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.not = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.lt = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn((resolve) => resolve(resolved));
    return chain;
  });

  const from = vi.fn();
  for (const chain of chains) {
    from.mockImplementationOnce(() => chain);
  }

  return {
    client: { from } as unknown as TypedSupabaseClient,
    chains,
  };
}

describe("listChangesets", () => {
  it("결과가 limit 이하이면 hasMore 없이 nextCursor가 null", async () => {
    const rows = [makeChangesetRow(3), makeChangesetRow(2)];
    const { client } = mockSupabaseSequence([{ data: rows }, { data: [] }]);

    const page = await listChangesets({
      supabase: client,
      spaceId: "space-1",
      limit: 5,
    });

    expect(page.changesets).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("결과가 limit+1이면 초과분을 잘라내고 nextCursor는 잘린 마지막 행의 number", async () => {
    const rows = [
      makeChangesetRow(5),
      makeChangesetRow(4),
      makeChangesetRow(3),
    ];
    const { client } = mockSupabaseSequence([{ data: rows }, { data: [] }]);

    const page = await listChangesets({
      supabase: client,
      spaceId: "space-1",
      limit: 2,
    });

    expect(page.changesets.map((c) => c.number)).toEqual([5, 4]);
    expect(page.nextCursor).toBe(4);
  });

  it("cursor가 있으면 number 기준 lt 필터를 건다", async () => {
    const { client, chains } = mockSupabaseSequence([
      { data: [] },
      { data: [] },
    ]);

    await listChangesets({
      supabase: client,
      spaceId: "space-1",
      limit: 10,
      cursor: 7,
    });

    expect(chains[0].lt).toHaveBeenCalledWith("number", 7);
  });

  it("cursor가 없으면 lt 필터를 걸지 않는다", async () => {
    const { client, chains } = mockSupabaseSequence([
      { data: [] },
      { data: [] },
    ]);

    await listChangesets({ supabase: client, spaceId: "space-1", limit: 10 });

    expect(chains[0].lt).not.toHaveBeenCalled();
  });

  it("open=true면 status=open만 조회", async () => {
    const { client, chains } = mockSupabaseSequence([
      { data: [] },
      { data: [] },
    ]);

    await listChangesets({
      supabase: client,
      spaceId: "space-1",
      limit: 10,
      open: true,
    });

    expect(chains[0].eq).toHaveBeenCalledWith("status", "open");
  });

  it("open=false면 status=closed만 조회", async () => {
    const { client, chains } = mockSupabaseSequence([
      { data: [] },
      { data: [] },
    ]);

    await listChangesets({
      supabase: client,
      spaceId: "space-1",
      limit: 10,
      open: false,
    });

    expect(chains[0].eq).toHaveBeenCalledWith("status", "closed");
  });

  it("open 미지정이면 status 필터 없이 전체를 조회", async () => {
    const { client, chains } = mockSupabaseSequence([
      { data: [] },
      { data: [] },
    ]);

    await listChangesets({ supabase: client, spaceId: "space-1", limit: 10 });

    expect(chains[0].eq).not.toHaveBeenCalledWith("status", expect.anything());
    expect(chains[0].in).not.toHaveBeenCalled();
  });

  it("manual은 open·closed 어느 쪽을 조회하든 항상 제외한다", async () => {
    const { client, chains } = mockSupabaseSequence([
      { data: [] },
      { data: [] },
    ]);

    await listChangesets({ supabase: client, spaceId: "space-1", limit: 10 });

    expect(chains[0].neq).toHaveBeenCalledWith("type", "manual");
  });
});

// Changeset 상세 URL이 number 기준이라, 되돌리기 응답에 실린 number를 FE가 그대로
// 내비게이션에 쓴다 — 이 값이 틀리면 되돌린 직후 엉뚱한 changeset으로 이동한다.
describe("revertChangeset", () => {
  function mockRevertRpc(
    rpcData: string,
    numberRow: { number: number | null },
  ) {
    return {
      rpc: vi.fn(() => Promise.resolve({ data: rpcData, error: null })),
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn(() => Promise.resolve({ data: numberRow, error: null })),
      })),
    } as unknown as TypedSupabaseClient;
  }

  it("RPC가 만든 revert changeset의 id와 number를 함께 돌려준다", async () => {
    const supabase = mockRevertRpc("revert-cs-1", { number: 13 });

    const result = await revertChangeset({
      supabase,
      changesetId: "original-cs-1",
    });

    expect(result).toEqual({
      revertChangesetId: "revert-cs-1",
      revertChangesetNumber: 13,
    });
  });

  it("revert changeset에 number가 없으면(불변식 위반) 던진다", async () => {
    const supabase = mockRevertRpc("revert-cs-2", { number: null });

    await expect(
      revertChangeset({ supabase, changesetId: "original-cs-2" }),
    ).rejects.toThrow(/has no number/);
  });
});
