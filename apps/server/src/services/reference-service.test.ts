import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import {
  addReferenceTag,
  archiveReference,
  getReference,
  getReferenceCitingDigests,
  removeReferenceTag,
  trashReference,
  updateReference,
} from "./reference-service";

const REFERENCE_ID = "11111111-1111-4111-a111-111111111111";
const TAG_ID = "22222222-2222-4222-a222-222222222222";

function mockRpcSupabase(error: { code: string; message: string } | null) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  return { supabase: { rpc } as unknown as TypedSupabaseClient, rpc };
}

// getReference는 두 테이블(references 단건, reference_tags 조인)을 병렬 조회한다 —
// 테이블별로 다른 종단(.single() vs 바로 await)을 흉내 낸다.
function mockGetReferenceSupabase(args: {
  reference: { data: unknown; error: { code: string; message: string } | null };
  tags: { data: unknown; error: { code: string; message: string } | null };
}) {
  const from = vi.fn((table: string) => {
    if (table === "references") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue(args.reference),
      };
    }
    if (table === "reference_tags") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue(args.tags),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as TypedSupabaseClient;
}

describe("trashReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("삭제는 trash_reference RPC 하나로 끝난다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await trashReference({ supabase, referenceId: REFERENCE_ID });

    expect(rpc).toHaveBeenCalledWith("trash_reference", {
      p_reference_id: REFERENCE_ID,
    });
  });

  // NM007(reference_state_changed)이 빠지면 error-mapper가 예상 밖 장애로 오분류해
  // 매 클릭마다 스퓨리어스 Sentry 캡처 + "Something went wrong"만 뜬다 — 코드까지 본다.
  it("active가 아니라 가드가 지면 reference_state_changed로 매핑된다", async () => {
    const { supabase } = mockRpcSupabase({
      code: "NM007",
      message: "reference ... is not an active reference the caller can trash",
    });

    await expect(
      trashReference({ supabase, referenceId: REFERENCE_ID }),
    ).rejects.toMatchObject({ code: "reference_state_changed" });
  });
});

describe("getReference", () => {
  it("reference 행과 reference_tags 조인을 하나의 상세로 합친다", async () => {
    const supabase = mockGetReferenceSupabase({
      reference: {
        data: {
          id: REFERENCE_ID,
          type: "person",
          title: "김OO",
          body: "설명",
          status: "active",
          external_urls: ["https://example.com"],
          created_at: "2026-07-21T00:00:00+00:00",
          updated_at: "2026-07-21T00:00:00+00:00",
        },
        error: null,
      },
      tags: {
        data: [{ tags: { id: TAG_ID, title: "백엔드" } }],
        error: null,
      },
    });

    const result = await getReference({ supabase, referenceId: REFERENCE_ID });

    expect(result).toEqual({
      id: REFERENCE_ID,
      type: "person",
      title: "김OO",
      body: "설명",
      status: "active",
      externalUrls: ["https://example.com"],
      tags: [{ id: TAG_ID, title: "백엔드" }],
      createdAt: "2026-07-21T00:00:00+00:00",
      updatedAt: "2026-07-21T00:00:00+00:00",
    });
  });

  // reference_tags 임베드는 기본 LEFT JOIN이라 고아 행(tags가 null)이 이론상
  // 나올 수 있다 — 조용히 걸러야 화면이 깨진 칩을 렌더링하지 않는다.
  it("tags가 null인 조인 행은 걸러낸다", async () => {
    const supabase = mockGetReferenceSupabase({
      reference: {
        data: {
          id: REFERENCE_ID,
          type: "term",
          title: "용어",
          body: "설명",
          status: "active",
          external_urls: null,
          created_at: "2026-07-21T00:00:00+00:00",
          updated_at: "2026-07-21T00:00:00+00:00",
        },
        error: null,
      },
      tags: { data: [{ tags: null }], error: null },
    });

    const result = await getReference({ supabase, referenceId: REFERENCE_ID });

    expect(result.tags).toEqual([]);
    expect(result.externalUrls).toEqual([]);
  });
});

describe("updateReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("update_reference RPC에 전체 상태를 그대로 넘긴다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await updateReference({
      supabase,
      referenceId: REFERENCE_ID,
      type: "person",
      title: "새 이름",
      body: "새 본문",
      externalUrls: ["https://example.com"],
    });

    expect(rpc).toHaveBeenCalledWith("update_reference", {
      p_reference_id: REFERENCE_ID,
      p_type: "person",
      p_title: "새 이름",
      p_body: "새 본문",
      p_external_urls: ["https://example.com"],
    });
  });

  it("active가 아니라 가드가 지면 reference_state_changed로 매핑된다", async () => {
    const { supabase } = mockRpcSupabase({
      code: "NM007",
      message: "reference ... is not an active reference the caller can edit",
    });

    await expect(
      updateReference({
        supabase,
        referenceId: REFERENCE_ID,
        type: "person",
        title: "새 이름",
        body: "새 본문",
        externalUrls: [],
      }),
    ).rejects.toMatchObject({ code: "reference_state_changed" });
  });
});

describe("archiveReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("archive_reference RPC 하나로 끝난다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await archiveReference({ supabase, referenceId: REFERENCE_ID });

    expect(rpc).toHaveBeenCalledWith("archive_reference", {
      p_reference_id: REFERENCE_ID,
    });
  });

  it("active가 아니라 가드가 지면 reference_state_changed로 매핑된다", async () => {
    const { supabase } = mockRpcSupabase({
      code: "NM007",
      message:
        "reference ... is not an active reference the caller can archive",
    });

    await expect(
      archiveReference({ supabase, referenceId: REFERENCE_ID }),
    ).rejects.toMatchObject({ code: "reference_state_changed" });
  });
});

describe("addReferenceTag / removeReferenceTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addReferenceTag는 link_reference_tag RPC를 호출한다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await addReferenceTag({
      supabase,
      referenceId: REFERENCE_ID,
      tagId: TAG_ID,
    });

    expect(rpc).toHaveBeenCalledWith("link_reference_tag", {
      p_reference_id: REFERENCE_ID,
      p_tag_id: TAG_ID,
    });
  });

  it("removeReferenceTag는 unlink_reference_tag RPC를 호출한다", async () => {
    const { supabase, rpc } = mockRpcSupabase(null);

    await removeReferenceTag({
      supabase,
      referenceId: REFERENCE_ID,
      tagId: TAG_ID,
    });

    expect(rpc).toHaveBeenCalledWith("unlink_reference_tag", {
      p_reference_id: REFERENCE_ID,
      p_tag_id: TAG_ID,
    });
  });
});

describe("getReferenceCitingDigests", () => {
  it("get_reference_citing_digests RPC 결과를 {id, title}로 매핑한다", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        { digest_id: "d1", digest_title: "Digest 1" },
        { digest_id: "d2", digest_title: "Digest 2" },
      ],
      error: null,
    }));
    const supabase = { rpc } as unknown as TypedSupabaseClient;

    const result = await getReferenceCitingDigests({
      supabase,
      referenceId: REFERENCE_ID,
    });

    expect(rpc).toHaveBeenCalledWith("get_reference_citing_digests", {
      p_reference_id: REFERENCE_ID,
    });
    expect(result.digests).toEqual([
      { id: "d1", title: "Digest 1" },
      { id: "d2", title: "Digest 2" },
    ]);
  });
});
