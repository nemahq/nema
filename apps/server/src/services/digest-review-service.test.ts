import { describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import {
  discardReview,
  getReview,
  restoreReview,
  updateReview,
} from "./digest-review-service";

const CHANGESET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOURCE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NEW_REFERENCE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EXISTING_REFERENCE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const SPACE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const WORKSPACE_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const EXISTING_TOPIC_ID = "11111111-2222-4222-8222-222222222222";
const EXISTING_TAG_ID = "33333333-4444-4444-8444-444444444444";

// getReview의 기존/신규 인용 분리는 write_ingestion_review_changes 병합의 역함수다 —
// 두 필터 술어가 뒤바뀌면 미확정 신규 레퍼런스가 referenceIds로 새어 확정 시
// 중복 레퍼런스가 생기는데, 어느 층도 소리 내지 않아 테스트로 고정한다.
// eq() 호출을 테이블별로 기록해 archived 제외 필터(status='active')가 빠지는
// 회귀도 같은 방식으로 고정한다(statement-search.test.ts의 active 필터 단언과 같은 결).
function mockSupabase(
  perTable: Record<string, unknown>,
): TypedSupabaseClient & {
  eqCallsByTable: Record<string, unknown[][]>;
  orderCallsByTable: Record<string, unknown[][]>;
} {
  const eqCallsByTable: Record<string, unknown[][]> = {};
  const orderCallsByTable: Record<string, unknown[][]> = {};
  return {
    eqCallsByTable,
    orderCallsByTable,
    from: vi.fn((table: string) => {
      const calls = (eqCallsByTable[table] ??= []);
      const orderCalls = (orderCallsByTable[table] ??= []);
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn((...args: unknown[]) => {
        calls.push(args);
        return chain;
      });
      chain.order = vi.fn((...args: unknown[]) => {
        orderCalls.push(args);
        return chain;
      });
      chain.in = vi
        .fn()
        .mockResolvedValue({ data: perTable[table], error: null });
      chain.single = vi
        .fn()
        .mockResolvedValue({ data: perTable[table], error: null });
      return chain;
    }),
  } as unknown as TypedSupabaseClient & {
    eqCallsByTable: Record<string, unknown[][]>;
    orderCallsByTable: Record<string, unknown[][]>;
  };
}

describe("getReview", () => {
  it("digest의 인용을 기존 레퍼런스(id)와 이 리뷰의 신규 제안(key)으로 정확히 가른다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "pending",
        source_id: SOURCE_ID,
        sources: {
          title: "원문 제목",
          body: "원문",
          created_at: "2026-07-07T00:00:00Z",
        },
        changes: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            action: "create",
            target_type: "reference",
            target_id: NEW_REFERENCE_ID,
            data: {
              type: "product",
              title: "신규 제품",
              body: "설명",
              external_urls: ["https://example.com"],
            },
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            action: "create",
            target_type: "digest",
            target_id: "33333333-3333-4333-8333-333333333333",
            data: {
              title: "제목",
              description: "요약",
              body: { type: "learning", finding: "발견" },
              topics: [],
              tags: [],
              reference_ids: [NEW_REFERENCE_ID, EXISTING_REFERENCE_ID],
              external_urls: [],
            },
          },
        ],
      },
      references: [
        {
          id: EXISTING_REFERENCE_ID,
          type: "person",
          title: "기존 인물",
          body: "기존 설명",
        },
      ],
    });

    const review = await getReview({ supabase, spaceId: SPACE_ID, number: 12 });

    expect(review.changesetNumber).toBe(12);
    expect(review.sourceTitle).toBe("원문 제목");
    expect(supabase.eqCallsByTable.changesets).toContainEqual([
      "space_id",
      SPACE_ID,
    ]);
    expect(supabase.eqCallsByTable.changesets).toContainEqual(["number", 12]);
    // 정렬이 빠지면 Postgres가 changes 행 순서를 보장하지 않는다. 프론트 편집 상태가
    // digests 배열의 인덱스를 키로 쓰므로, refetch 때 순서가 달라지면 제목 수정이나
    // 후보 삭제가 다른 후보에 붙는다 — 어느 층도 에러를 내지 않는 회귀라 여기서 막는다.
    expect(supabase.orderCallsByTable.changesets).toContainEqual([
      "created_at",
      { referencedTable: "changes" },
    ]);
    expect(supabase.orderCallsByTable.changesets).toContainEqual([
      "id",
      { referencedTable: "changes" },
    ]);
    expect(review.digests[0]?.referenceIds).toEqual([EXISTING_REFERENCE_ID]);
    expect(review.digests[0]?.newReferenceKeys).toEqual([NEW_REFERENCE_ID]);
    expect(review.newReferences).toEqual([
      {
        key: NEW_REFERENCE_ID,
        type: "product",
        title: "신규 제품",
        body: "설명",
        externalUrls: ["https://example.com"],
      },
    ]);
    expect(review.citedReferences).toEqual([
      {
        id: EXISTING_REFERENCE_ID,
        type: "person",
        title: "기존 인물",
        body: "기존 설명",
        mergeNote: null,
      },
    ]);
  });

  // 한 changeset에 인용된 기존 Reference가 여럿이고 그중 일부만 병합 제안이 있는 실제
  // 상황 — 제안 있는 것만 mergeNote가 붙고 나머지는 null이어야 한다. "제안 하나라도
  // 있으면 전부에 적용" 같은 mergeNoteById 회귀를 이 혼합 케이스로 고정한다.
  it("일부 인용 Reference에만 병합 제안이 있으면 그것만 mergeNote, 나머지는 null", async () => {
    const MERGED_REFERENCE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const PLAIN_REFERENCE_ID = "eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee";
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "pending",
        source_id: SOURCE_ID,
        space_id: SPACE_ID,
        spaces: { workspace_id: WORKSPACE_ID },
        sources: {
          title: "원문 제목",
          body: "원문",
          created_at: "2026-07-07T00:00:00Z",
        },
        changes: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            action: "create",
            target_type: "digest",
            target_id: "33333333-3333-4333-8333-333333333333",
            data: {
              title: "제목",
              description: "요약",
              body: { type: "learning", finding: "발견" },
              topics: [],
              tags: [],
              reference_ids: [MERGED_REFERENCE_ID, PLAIN_REFERENCE_ID],
              external_urls: [],
            },
          },
          {
            id: "44444444-4444-4444-8444-444444444444",
            action: "modify",
            target_type: "reference",
            target_id: MERGED_REFERENCE_ID,
            data: {
              before: { body: "기존 설명" },
              after: { body: "새 정보를 녹인 다듬은 설명" },
            },
          },
        ],
      },
      references: [
        {
          id: MERGED_REFERENCE_ID,
          type: "person",
          title: "병합된 인물",
          body: "기존 설명",
        },
        {
          id: PLAIN_REFERENCE_ID,
          type: "product",
          title: "단순 인용 제품",
          body: "제품 설명",
        },
      ],
    });

    const review = await getReview({ supabase, spaceId: SPACE_ID, number: 12 });

    expect(review.citedReferences).toEqual([
      {
        id: MERGED_REFERENCE_ID,
        type: "person",
        title: "병합된 인물",
        body: "기존 설명",
        mergeNote: "새 정보를 녹인 다듬은 설명",
      },
      {
        id: PLAIN_REFERENCE_ID,
        type: "product",
        title: "단순 인용 제품",
        body: "제품 설명",
        mergeNote: null,
      },
    ]);
  });

  it("topic·tag를 이름으로 Space/Workspace 레지스트리와 매칭해 기존(id)/신규(null)를 가른다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "pending",
        source_id: SOURCE_ID,
        space_id: SPACE_ID,
        spaces: { workspace_id: WORKSPACE_ID },
        sources: {
          title: "원문 제목",
          body: "원문",
          created_at: "2026-07-07T00:00:00Z",
        },
        changes: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            action: "create",
            target_type: "digest",
            target_id: "33333333-3333-4333-8333-333333333333",
            data: {
              title: "제목",
              description: "요약",
              body: { type: "learning", finding: "발견" },
              topics: ["기존 주제", "새 주제"],
              tags: [
                { title: "기존 태그", description: "기존 정의" },
                { title: "새 태그", description: "새 정의" },
              ],
              reference_ids: [],
              external_urls: [],
            },
          },
        ],
      },
      topics: [{ id: EXISTING_TOPIC_ID, title: "기존 주제" }],
      tags: [{ id: EXISTING_TAG_ID, title: "기존 태그" }],
    });

    const review = await getReview({ supabase, spaceId: SPACE_ID, number: 12 });

    expect(review.digests[0]?.topics).toEqual([
      { id: EXISTING_TOPIC_ID, title: "기존 주제" },
      { id: null, title: "새 주제" },
    ]);
    expect(review.digests[0]?.tags).toEqual([
      { id: EXISTING_TAG_ID, title: "기존 태그", description: "기존 정의" },
      { id: null, title: "새 태그", description: "새 정의" },
    ]);
    expect(supabase.eqCallsByTable.topics).toContainEqual(["status", "active"]);
    expect(supabase.eqCallsByTable.tags).toContainEqual(["status", "active"]);
  });

  it("pending ingestion이 아니면 리뷰로 취급하지 않는다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        type: "ingestion",
        status: "applied",
        source_id: SOURCE_ID,
        sources: {
          title: "원문 제목",
          body: "원문",
          created_at: "2026-07-07T00:00:00Z",
        },
        changes: [],
      },
    });

    await expect(
      getReview({ supabase, spaceId: SPACE_ID, number: 12 }),
    ).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("not a pending ingestion review"),
    });
  });
});

describe("updateReview", () => {
  // p_new_references는 as unknown as Json으로 나가는 객체 리터럴이라 키 오타를
  // 타입체크가 못 잡는다 — RPC 계약 키(snake_case external_urls)를 고정한다.
  it("신규 레퍼런스의 externalUrls를 RPC 계약 키(external_urls)로 실어 보낸다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await updateReview({
      supabase,
      changesetId: CHANGESET_ID,
      digests: [],
      newReferences: [
        {
          key: NEW_REFERENCE_ID,
          type: "product",
          title: "토스",
          body: "송금 앱",
          externalUrls: ["https://toss.im"],
        },
      ],
      referenceUpdates: [],
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_pending_ingestion",
      expect.objectContaining({
        p_new_references: [
          {
            key: NEW_REFERENCE_ID,
            type: "product",
            title: "토스",
            body: "송금 앱",
            external_urls: ["https://toss.im"],
          },
        ],
      }),
    );
  });

  // 병합 편집(mergeNote)은 RPC 계약 키(reference_id/body)로 실어 보낸다 — 계약 키가
  // 어긋나면 확정 시 references.body가 안 바뀌는데 어느 층도 소리 내지 않는다.
  it("병합 편집을 RPC 계약 키(reference_id/body)로 실어 보낸다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await updateReview({
      supabase,
      changesetId: CHANGESET_ID,
      digests: [],
      newReferences: [],
      referenceUpdates: [
        { referenceId: EXISTING_REFERENCE_ID, mergeNote: "다듬은 설명" },
      ],
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_pending_ingestion",
      expect.objectContaining({
        p_reference_updates: [
          { reference_id: EXISTING_REFERENCE_ID, body: "다듬은 설명" },
        ],
      }),
    );
  });

  // getReview가 표시용으로 붙인 topic/tag의 id는 write_ingestion_review_changes가 모르는
  // 키다 — 그대로 실어 보내면 저장 형태와 어긋나므로, name/{title,description}만 남기고
  // 벗겨내는지 고정한다.
  it("topic/tag의 표시용 id를 저장 계약(name/{title,description})으로 벗겨 보낸다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await updateReview({
      supabase,
      changesetId: CHANGESET_ID,
      digests: [
        {
          title: "제목",
          description: "요약",
          body: { type: "learning", finding: "발견" },
          topics: [
            { id: EXISTING_TOPIC_ID, title: "기존 주제" },
            { id: null, title: "새 주제" },
          ],
          tags: [
            {
              id: EXISTING_TAG_ID,
              title: "기존 태그",
              description: "기존 정의",
            },
            { id: null, title: "새 태그", description: "새 정의" },
          ],
          referenceIds: [],
          newReferenceKeys: [],
          externalUrls: [],
        },
      ],
      newReferences: [],
      referenceUpdates: [],
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_pending_ingestion",
      expect.objectContaining({
        p_digests: [
          expect.objectContaining({
            topics: ["기존 주제", "새 주제"],
            tags: [
              { title: "기존 태그", description: "기존 정의" },
              { title: "새 태그", description: "새 정의" },
            ],
          }),
        ],
      }),
    );
  });
});

describe("discardReview", () => {
  it("discard_ingestion_review RPC를 호출한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await discardReview({ supabase, changesetId: CHANGESET_ID });

    expect(rpc).toHaveBeenCalledWith("discard_ingestion_review", {
      p_changeset_id: CHANGESET_ID,
    });
  });

  // NM008(ingestion_review_state_changed)이 빠지면 error-mapper가 예상 밖 장애로
  // 오분류해 매 클릭마다 스퓨리어스 Sentry 캡처 + "Something went wrong"만 뜬다.
  it("가드가 지면(이미 pending이 아님) ingestion_review_state_changed로 매핑된다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "NM008",
        message:
          "changeset ... is not a pending ingestion review the caller can discard",
      },
    });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await expect(
      discardReview({ supabase, changesetId: CHANGESET_ID }),
    ).rejects.toMatchObject({ code: "ingestion_review_state_changed" });
  });
});

describe("restoreReview", () => {
  it("restore_ingestion_review RPC를 호출한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await restoreReview({ supabase, changesetId: CHANGESET_ID });

    expect(rpc).toHaveBeenCalledWith("restore_ingestion_review", {
      p_changeset_id: CHANGESET_ID,
    });
  });

  it("가드가 지면(discarded가 아니거나 원문이 trashed됨) ingestion_review_state_changed로 매핑된다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "NM008",
        message:
          "source ... is not pending — cannot restore a review over a trashed source",
      },
    });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await expect(
      restoreReview({ supabase, changesetId: CHANGESET_ID }),
    ).rejects.toMatchObject({ code: "ingestion_review_state_changed" });
  });
});
