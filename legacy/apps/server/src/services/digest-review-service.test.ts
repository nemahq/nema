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
const EXISTING_TOPIC_REGISTRY_ID = "11111111-2222-4222-8222-222222222222";
const EXISTING_TAG_REGISTRY_ID = "33333333-4444-4444-8444-444444444444";
const TOPIC_DRAFT_ID_1 = "55555555-5555-4555-8555-555555555555";
const TOPIC_DRAFT_ID_2 = "66666666-6666-4666-8666-666666666666";
const TAG_DRAFT_ID_1 = "77777777-7777-4777-8777-777777777777";
const TAG_DRAFT_ID_2 = "88888888-8888-4888-8888-888888888888";

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
  it("digest의 인용을 기존 레퍼런스(id)와 이 리뷰의 신규 제안(id)으로 정확히 가른다", async () => {
    const DIGEST_ID = "33333333-3333-4333-8333-333333333333";
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "open",
        source_id: SOURCE_ID,
        draft_version: 3,
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
            position: 0,
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
            target_id: DIGEST_ID,
            position: 0,
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
    expect(review.draftVersion).toBe(3);
    expect(supabase.eqCallsByTable.changesets).toContainEqual([
      "space_id",
      SPACE_ID,
    ]);
    expect(supabase.eqCallsByTable.changesets).toContainEqual(["number", 12]);
    // 정렬이 빠지면 Postgres가 changes 행 순서를 보장하지 않는다. position이 명시적
    // 순서를 고정하고, id는 동순위일 때만 쓰는 tiebreak — 어느 층도 에러를 내지 않는
    // 회귀라 여기서 막는다.
    expect(supabase.orderCallsByTable.changesets).toContainEqual([
      "position",
      { referencedTable: "changes" },
    ]);
    expect(supabase.orderCallsByTable.changesets).toContainEqual([
      "id",
      { referencedTable: "changes" },
    ]);
    expect(review.digests[0]?.id).toBe(DIGEST_ID);
    expect(review.digests[0]?.position).toBe(0);
    expect(review.digests[0]?.referenceIds).toEqual([EXISTING_REFERENCE_ID]);
    expect(review.digests[0]?.newReferenceKeys).toEqual([NEW_REFERENCE_ID]);
    expect(review.newReferences).toEqual([
      {
        id: NEW_REFERENCE_ID,
        position: 0,
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

  it("리뷰 후보(create) 행에 position이 없으면(스키마·데이터 불일치) 조용히 넘기지 않는다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "open",
        source_id: SOURCE_ID,
        draft_version: 1,
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
            position: null,
            data: {
              title: "제목",
              description: "요약",
              body: { type: "learning", finding: "발견" },
              topics: [],
              tags: [],
              reference_ids: [],
              external_urls: [],
            },
          },
        ],
      },
    });

    await expect(
      getReview({ supabase, spaceId: SPACE_ID, number: 12 }),
    ).rejects.toMatchObject({ code: "query_failed" });
  });

  // 태그 색상 팔레트 개편(TAG_COLORS에서 값 제거·교체)이 있으면 그 이전에 저장된
  // label_draft에는 더 이상 유효하지 않은 옛 색상값이 남을 수 있다 — ZodError를
  // 그대로 흘려보내면 trpc.ts의 isZodInputError가 오인해 원인 추적이 막히므로
  // query_failed로 명시하는지 고정한다.
  it("label_draft의 태그 색상이 더 이상 유효하지 않으면(팔레트 값 목록 변경) 조용히 넘기지 않는다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "open",
        source_id: SOURCE_ID,
        draft_version: 1,
        label_draft: {
          topics: [],
          tags: [
            {
              id: EXISTING_TAG_REGISTRY_ID,
              title: "태그",
              description: "설명",
              color: "slate",
            },
          ],
        },
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
            position: 0,
            data: {
              title: "제목",
              description: "요약",
              body: { type: "learning", finding: "발견" },
              topics: [],
              tags: [EXISTING_TAG_REGISTRY_ID],
              reference_ids: [],
              external_urls: [],
            },
          },
        ],
      },
    });

    await expect(
      getReview({ supabase, spaceId: SPACE_ID, number: 12 }),
    ).rejects.toMatchObject({ code: "query_failed" });
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
        status: "open",
        source_id: SOURCE_ID,
        space_id: SPACE_ID,
        draft_version: 1,
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
            position: 0,
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
    // archived Reference를 인용 목록에 올리면, 병합 제안이 있던 것은 이 저장에서
    // 손대지 않아도 매 저장마다 다시 실려 update_pending_ingestion의 NM008
    // 가드(활성만 병합 허용)에 영구히 막힌다 — 이 필터가 빠지면 그 상태로
    // 되돌아간다.
    expect(supabase.eqCallsByTable.references).toContainEqual([
      "status",
      "active",
    ]);
  });

  it("리뷰 레벨 팔레트(label_draft)의 topic·tag를 이름으로 Space/Workspace 레지스트리와 매칭해 기존(registryId)/신규(null)를 가르고, 팔레트 항목 id는 그대로 왕복하며, 기존 태그는 draft 색 대신 레지스트리 색을 쓴다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        number: 12,
        type: "ingestion",
        status: "open",
        source_id: SOURCE_ID,
        space_id: SPACE_ID,
        draft_version: 1,
        spaces: { workspace_id: WORKSPACE_ID },
        sources: {
          title: "원문 제목",
          body: "원문",
          created_at: "2026-07-07T00:00:00Z",
        },
        label_draft: {
          topics: [
            { id: TOPIC_DRAFT_ID_1, title: "기존 주제" },
            { id: TOPIC_DRAFT_ID_2, title: "새 주제" },
          ],
          tags: [
            {
              id: TAG_DRAFT_ID_1,
              title: "기존 태그",
              description: "기존 정의",
              color: "cyan",
            },
            {
              id: TAG_DRAFT_ID_2,
              title: "새 태그",
              description: "새 정의",
              color: "olive",
            },
          ],
        },
        changes: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            action: "create",
            target_type: "digest",
            target_id: "33333333-3333-4333-8333-333333333333",
            position: 0,
            data: {
              title: "제목",
              description: "요약",
              body: { type: "learning", finding: "발견" },
              topics: [TOPIC_DRAFT_ID_1, TOPIC_DRAFT_ID_2],
              tags: [TAG_DRAFT_ID_1, TAG_DRAFT_ID_2],
              reference_ids: [],
              external_urls: [],
            },
          },
        ],
      },
      topics: [{ id: EXISTING_TOPIC_REGISTRY_ID, title: "기존 주제" }],
      // 레지스트리 색(violet)을 draft 색(cyan)과 다르게 둬서, 기존 태그가
      // registryId로 매칭되면 draft 색이 아니라 레지스트리 색을 쓰는지 검증한다.
      tags: [
        { id: EXISTING_TAG_REGISTRY_ID, title: "기존 태그", color: "violet" },
      ],
    });

    const review = await getReview({ supabase, spaceId: SPACE_ID, number: 12 });

    expect(review.digests[0]?.topics).toEqual([
      TOPIC_DRAFT_ID_1,
      TOPIC_DRAFT_ID_2,
    ]);
    expect(review.digests[0]?.tags).toEqual([TAG_DRAFT_ID_1, TAG_DRAFT_ID_2]);
    expect(review.labelDraft.topics).toEqual([
      {
        id: TOPIC_DRAFT_ID_1,
        registryId: EXISTING_TOPIC_REGISTRY_ID,
        title: "기존 주제",
      },
      { id: TOPIC_DRAFT_ID_2, registryId: null, title: "새 주제" },
    ]);
    expect(review.labelDraft.tags).toEqual([
      {
        id: TAG_DRAFT_ID_1,
        registryId: EXISTING_TAG_REGISTRY_ID,
        title: "기존 태그",
        description: "기존 정의",
        color: "violet",
      },
      {
        id: TAG_DRAFT_ID_2,
        registryId: null,
        title: "새 태그",
        description: "새 정의",
        color: "olive",
      },
    ]);
    expect(supabase.eqCallsByTable.topics).toContainEqual(["status", "active"]);
    expect(supabase.eqCallsByTable.tags).toContainEqual(["status", "active"]);
  });

  it("열린 ingestion이 아니면 리뷰로 취급하지 않는다", async () => {
    const supabase = mockSupabase({
      changesets: {
        id: CHANGESET_ID,
        type: "ingestion",
        status: "closed",
        outcome: "applied",
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
      message: expect.stringContaining("not an open ingestion review"),
    });
  });
});

describe("updateReview", () => {
  // p_new_references는 as unknown as Json으로 나가는 객체 리터럴이라 키 오타를
  // 타입체크가 못 잡는다 — RPC 계약 키(snake_case external_urls)를 고정한다.
  it("신규 레퍼런스의 id·position·externalUrls를 RPC 계약 키로 실어 보내고 draftVersion을 반환한다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 4, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    const result = await updateReview({
      supabase,
      changesetId: CHANGESET_ID,
      expectedVersion: 3,
      digests: [],
      labelDraft: { topics: [], tags: [] },
      newReferences: [
        {
          id: NEW_REFERENCE_ID,
          position: 0,
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
        p_changeset_id: CHANGESET_ID,
        p_expected_version: 3,
        p_new_references: [
          {
            id: NEW_REFERENCE_ID,
            position: 0,
            type: "product",
            title: "토스",
            body: "송금 앱",
            external_urls: ["https://toss.im"],
          },
        ],
      }),
    );
    expect(result).toEqual({ draftVersion: 4 });
  });

  // 병합 편집(mergeNote)은 RPC 계약 키(reference_id/body)로 실어 보낸다 — 계약 키가
  // 어긋나면 확정 시 references.body가 안 바뀌는데 어느 층도 소리 내지 않는다.
  it("병합 편집을 RPC 계약 키(reference_id/body)로 실어 보낸다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await updateReview({
      supabase,
      changesetId: CHANGESET_ID,
      expectedVersion: 1,
      digests: [],
      labelDraft: { topics: [], tags: [] },
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

  // 팔레트(labelDraft)의 topic/tag는 getReview가 표시용으로 붙인 registryId를
  // 저장 형태에 없는 키라 벗겨내고, 항목 자체의 정체성(id)은 그대로 왕복시키는지
  // 고정한다. Digest 쪽 topics/tags는 이미 팔레트 id 배열이라 그대로 통과해야 한다.
  it("digest의 topics/tags는 id 배열 그대로, labelDraft는 registryId를 벗겨 저장 계약으로 보낸다", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    const DIGEST_ID = "33333333-3333-4333-8333-333333333333";
    await updateReview({
      supabase,
      changesetId: CHANGESET_ID,
      expectedVersion: 1,
      digests: [
        {
          id: DIGEST_ID,
          position: 0,
          title: "제목",
          description: "요약",
          body: { type: "learning", finding: "발견" },
          topics: [TOPIC_DRAFT_ID_1, TOPIC_DRAFT_ID_2],
          tags: [TAG_DRAFT_ID_1, TAG_DRAFT_ID_2],
          referenceIds: [],
          newReferenceKeys: [],
          externalUrls: [],
        },
      ],
      labelDraft: {
        topics: [
          {
            id: TOPIC_DRAFT_ID_1,
            registryId: EXISTING_TOPIC_REGISTRY_ID,
            title: "기존 주제",
          },
          { id: TOPIC_DRAFT_ID_2, registryId: null, title: "새 주제" },
        ],
        tags: [
          {
            id: TAG_DRAFT_ID_1,
            registryId: EXISTING_TAG_REGISTRY_ID,
            title: "기존 태그",
            description: "기존 정의",
            color: "cyan",
          },
          {
            id: TAG_DRAFT_ID_2,
            registryId: null,
            title: "새 태그",
            description: "새 정의",
            color: "olive",
          },
        ],
      },
      newReferences: [],
      referenceUpdates: [],
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_pending_ingestion",
      expect.objectContaining({
        p_digests: [
          expect.objectContaining({
            id: DIGEST_ID,
            position: 0,
            topics: [TOPIC_DRAFT_ID_1, TOPIC_DRAFT_ID_2],
            tags: [TAG_DRAFT_ID_1, TAG_DRAFT_ID_2],
          }),
        ],
        p_label_draft: {
          topics: [
            { id: TOPIC_DRAFT_ID_1, title: "기존 주제" },
            { id: TOPIC_DRAFT_ID_2, title: "새 주제" },
          ],
          tags: [
            {
              id: TAG_DRAFT_ID_1,
              title: "기존 태그",
              description: "기존 정의",
              color: "cyan",
            },
            {
              id: TAG_DRAFT_ID_2,
              title: "새 태그",
              description: "새 정의",
              color: "olive",
            },
          ],
        },
      }),
    );
  });

  // NM012(ingestion_review_version_conflict)이 NM008과 뒤섞이면 두 탭 동시 편집
  // 거절이 "상태가 바뀜" 문구로 새 나가 원인이 다른 두 상황이 같은 안내로 뭉개진다.
  it("draftVersion이 어긋나면(NM012) ingestion_review_version_conflict로 매핑된다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "NM012",
        message: "ingestion review ... draft version mismatch",
      },
    });
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    await expect(
      updateReview({
        supabase,
        changesetId: CHANGESET_ID,
        expectedVersion: 1,
        digests: [],
        labelDraft: { topics: [], tags: [] },
        newReferences: [],
        referenceUpdates: [],
      }),
    ).rejects.toMatchObject({ code: "ingestion_review_version_conflict" });
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
  it("가드가 지면(이미 열려 있지 않음) ingestion_review_state_changed로 매핑된다", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "NM008",
        message:
          "changeset ... is not an open ingestion review the caller can discard",
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
