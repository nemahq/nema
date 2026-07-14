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

// getReview의 기존/신규 인용 분리는 write_ingestion_review_changes 병합의 역함수다 —
// 두 필터 술어가 뒤바뀌면 미확정 신규 레퍼런스가 referenceIds로 새어 확정 시
// 중복 레퍼런스가 생기는데, 어느 층도 소리 내지 않아 테스트로 고정한다.
function mockSupabase(perTable: Record<string, unknown>): TypedSupabaseClient {
  return {
    from: vi.fn((table: string) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.in = vi
        .fn()
        .mockResolvedValue({ data: perTable[table], error: null });
      chain.single = vi
        .fn()
        .mockResolvedValue({ data: perTable[table], error: null });
      return chain;
    }),
  } as unknown as TypedSupabaseClient;
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
        { id: EXISTING_REFERENCE_ID, type: "person", title: "기존 인물" },
      ],
    });

    const review = await getReview({ supabase, changesetId: CHANGESET_ID });

    expect(review.changesetNumber).toBe(12);
    expect(review.sourceTitle).toBe("원문 제목");
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
      { id: EXISTING_REFERENCE_ID, type: "person", title: "기존 인물" },
    ]);
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
      getReview({ supabase, changesetId: CHANGESET_ID }),
    ).rejects.toThrow("not a pending ingestion review");
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

  it("가드가 지면(discarded가 아니거나 원본이 trashed됨) ingestion_review_state_changed로 매핑된다", async () => {
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
