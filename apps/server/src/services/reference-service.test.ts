import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import {
  addReferenceTag,
  archiveReference,
  getReference,
  getReferenceCitingDigests,
  listReferences,
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

function encodeReferenceCursor(args: {
  sortKey: "title" | "createdAt";
  sortValue: string;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify([args.sortKey, args.sortValue, args.id]),
  ).toString("base64url");
}

function decodeReferenceCursor(cursor: string): [string, string, string] {
  return JSON.parse(Buffer.from(cursor, "base64url").toString()) as [
    string,
    string,
    string,
  ];
}

const ROW_ID_A = "11111111-1111-4111-a111-111111111111";
const ROW_ID_B = "22222222-2222-4222-a222-222222222222";
const ROW_ID_C = "33333333-3333-4333-a333-333333333333";

function makeReferenceRow(overrides: {
  id: string;
  title: string;
  created_at: string;
}) {
  return { type: "term", status: "active", ...overrides };
}

function mockListSupabase(resolved: { data?: unknown; error?: unknown }) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.neq = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.ilike = vi.fn().mockReturnValue(chain);
  chain.or = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn((resolve) => resolve(resolved));

  return {
    client: {
      from: vi.fn().mockReturnValue(chain),
    } as unknown as TypedSupabaseClient,
    chain,
  };
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

describe("listReferences", () => {
  const baseArgs = {
    sortKey: "title" as const,
    sortDirection: "asc" as const,
    limit: 2,
  };

  it("결과가 limit 이하이면 nextCursor가 null", async () => {
    const rows = [
      makeReferenceRow({
        id: ROW_ID_A,
        title: "가",
        created_at: "2026-01-01T00:00:00Z",
      }),
    ];
    const { client } = mockListSupabase({ data: rows });

    const page = await listReferences({ supabase: client, ...baseArgs });

    expect(page.references).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  // limit+1 트릭의 경계값 — 정확히 limit개만 오면(하나 더 안 옴) 다음 페이지가
  // 없다고 판단해야 한다. rows.length > limit을 >=로 잘못 쓰면 이 경우도
  // "더 있음"으로 오판한다.
  it("결과가 정확히 limit개면(하나 더 없으면) nextCursor가 null", async () => {
    const rows = [
      makeReferenceRow({
        id: ROW_ID_A,
        title: "가",
        created_at: "2026-01-01T00:00:00Z",
      }),
      makeReferenceRow({
        id: ROW_ID_B,
        title: "나",
        created_at: "2026-01-02T00:00:00Z",
      }),
    ];
    const { client } = mockListSupabase({ data: rows });

    const page = await listReferences({ supabase: client, ...baseArgs });

    expect(page.references).toHaveLength(2);
    expect(page.nextCursor).toBeNull();
  });

  it("결과가 limit+1이면 nextCursor가 마지막 항목의 (sortKey, 정렬값, id) 인코딩", async () => {
    const rows = [
      makeReferenceRow({
        id: ROW_ID_A,
        title: "가",
        created_at: "2026-01-01T00:00:00Z",
      }),
      makeReferenceRow({
        id: ROW_ID_B,
        title: "나",
        created_at: "2026-01-02T00:00:00Z",
      }),
      makeReferenceRow({
        id: ROW_ID_C,
        title: "다",
        created_at: "2026-01-03T00:00:00Z",
      }),
    ];
    const { client } = mockListSupabase({ data: rows });

    const page = await listReferences({ supabase: client, ...baseArgs });

    expect(page.references).toHaveLength(2);
    const [cursorSortKey, sortValue, id] = decodeReferenceCursor(
      page.nextCursor as string,
    );
    expect(cursorSortKey).toBe("title");
    expect(sortValue).toBe("나");
    expect(id).toBe(ROW_ID_B);
  });

  // sortKey가 createdAt이면 커서도 created_at 기준이어야 정렬 기준을 바꿔도
  // 페이지 경계가 어긋나지 않는다.
  it("sortKey가 createdAt이면 nextCursor도 created_at 기준", async () => {
    const rows = [
      makeReferenceRow({
        id: ROW_ID_A,
        title: "다",
        created_at: "2026-01-01T00:00:00Z",
      }),
      makeReferenceRow({
        id: ROW_ID_B,
        title: "가",
        created_at: "2026-01-02T00:00:00Z",
      }),
    ];
    const { client } = mockListSupabase({ data: rows });

    const page = await listReferences({
      supabase: client,
      sortKey: "createdAt",
      sortDirection: "asc",
      limit: 1,
    });

    const [cursorSortKey, sortValue] = decodeReferenceCursor(
      page.nextCursor as string,
    );
    expect(cursorSortKey).toBe("createdAt");
    expect(sortValue).toBe("2026-01-01T00:00:00Z");
  });

  it("cursor가 있으면 정렬값+id 복합 필터를 적용한다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "title",
      sortValue: "나",
      id: ROW_ID_B,
    });

    await listReferences({ supabase: client, ...baseArgs, cursor });

    expect(chain.or).toHaveBeenCalledWith(
      `title.gt."나",and(title.eq."나",id.gt.${ROW_ID_B})`,
    );
  });

  // createdAt 정렬에서도 decode→필터 재구성이 title과 같은 컬럼(created_at)을
  // 쓰는지 실제로 확인한다 — 지금까지는 인코딩(위 테스트)만 확인했었다.
  it("sortKey가 createdAt이면 커서 필터도 created_at 컬럼을 쓴다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "createdAt",
      sortValue: "2026-01-02T00:00:00Z",
      id: ROW_ID_B,
    });

    await listReferences({
      supabase: client,
      sortKey: "createdAt",
      sortDirection: "asc",
      limit: 2,
      cursor,
    });

    expect(chain.or).toHaveBeenCalledWith(
      `created_at.gt."2026-01-02T00:00:00Z",and(created_at.eq."2026-01-02T00:00:00Z",id.gt.${ROW_ID_B})`,
    );
  });

  // 정렬값(title)에 콤마·괄호가 들어가면 PostgREST or() 문법의 구분자와
  // 충돌하므로 큰따옴표로 감싸 리터럴 처리해야 한다.
  it("정렬값에 콤마·괄호가 있어도 or() 필터가 값 전체를 리터럴로 감싼다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "title",
      sortValue: "OpenAI, Inc. (사례)",
      id: ROW_ID_B,
    });

    await listReferences({ supabase: client, ...baseArgs, cursor });

    expect(chain.or).toHaveBeenCalledWith(
      `title.gt."OpenAI, Inc. (사례)",and(title.eq."OpenAI, Inc. (사례)",id.gt.${ROW_ID_B})`,
    );
  });

  // 정렬값에 큰따옴표 자체가 들어가면 quoteFilterValue가 이스케이프한
  // \" 로 감싸져야 한다 — 안 그러면 큰따옴표가 리터럴 구간을 조기 종료시켜
  // or() 문법이 깨진다.
  it("정렬값에 큰따옴표가 있으면 이스케이프해서 감싼다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "title",
      sortValue: 'He said "wow"',
      id: ROW_ID_B,
    });

    await listReferences({ supabase: client, ...baseArgs, cursor });

    expect(chain.or).toHaveBeenCalledWith(
      `title.gt."He said \\"wow\\"",and(title.eq."He said \\"wow\\"",id.gt.${ROW_ID_B})`,
    );
  });

  it("내림차순이면 gt 대신 lt로 비교한다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "title",
      sortValue: "나",
      id: ROW_ID_B,
    });

    await listReferences({
      supabase: client,
      sortKey: "title",
      sortDirection: "desc",
      limit: 2,
      cursor,
    });

    expect(chain.or).toHaveBeenCalledWith(
      `title.lt."나",and(title.eq."나",id.lt.${ROW_ID_B})`,
    );
  });

  it("깨진 cursor는 BAD_REQUEST로 거부한다", async () => {
    const { client } = mockListSupabase({ data: [] });

    await expect(
      listReferences({
        supabase: client,
        ...baseArgs,
        cursor: "not-valid-base64url-json",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // id가 uuid가 아니면 or() 필터에 그대로 꽂혀 Postgres가 22P02를 던지고,
  // toSupabaseErrorCode가 이 코드를 모르니 500(query_failed)으로 새 나간다 —
  // 그 전에 여기서 BAD_REQUEST로 막아야 한다.
  it("id가 uuid가 아닌 cursor는 BAD_REQUEST로 거부한다", async () => {
    const { client } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "title",
      sortValue: "나",
      id: "not-a-uuid",
    });

    await expect(
      listReferences({ supabase: client, ...baseArgs, cursor }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  // title 기준으로 발급된 커서를 createdAt 정렬로 재사용(또는 그 반대)하면
  // 정렬값 타입이 안 맞아도 문자열이라 조용히 통과할 수 있다 — sortKey
  // 자체를 커서에 실어 불일치를 명시적으로 걸러야 한다.
  it("다른 sortKey로 발급된 cursor는 BAD_REQUEST로 거부한다", async () => {
    const { client } = mockListSupabase({ data: [] });
    const cursor = encodeReferenceCursor({
      sortKey: "createdAt",
      sortValue: "2026-01-01T00:00:00Z",
      id: ROW_ID_B,
    });

    await expect(
      listReferences({ supabase: client, ...baseArgs, cursor }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("구조만 맞고 타입이 틀린 cursor([1,2,3], 2튜플 등)는 BAD_REQUEST로 거부한다", async () => {
    const { client } = mockListSupabase({ data: [] });
    const malformedCursors = [
      Buffer.from(JSON.stringify([1, 2, 3])).toString("base64url"),
      Buffer.from(JSON.stringify({ a: 1 })).toString("base64url"),
      Buffer.from(JSON.stringify(["title", ROW_ID_B])).toString("base64url"),
      Buffer.from(
        JSON.stringify(["unknown-sort-key", "나", ROW_ID_B]),
      ).toString("base64url"),
    ];

    for (const cursor of malformedCursors) {
      await expect(
        listReferences({ supabase: client, ...baseArgs, cursor }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  });

  it("search는 %·_·\\를 이스케이프해 ilike 패턴으로 넘긴다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });

    await listReferences({
      supabase: client,
      ...baseArgs,
      search: "50%_off\\deal",
    });

    expect(chain.ilike).toHaveBeenCalledWith("title", "%50\\%\\_off\\\\deal%");
  });

  it("type·status 필터는 각각 eq()를 호출한다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });

    await listReferences({
      supabase: client,
      ...baseArgs,
      type: "person",
      status: "archived",
    });

    expect(chain.eq).toHaveBeenCalledWith("type", "person");
    expect(chain.eq).toHaveBeenCalledWith("status", "archived");
  });

  it("status가 all이면 eq()를 호출하지 않는다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });

    await listReferences({ supabase: client, ...baseArgs, status: "all" });

    expect(chain.eq).not.toHaveBeenCalledWith("status", expect.anything());
  });

  // status 자체를 안 넘긴 호출(dev-harness 이전 소비처 등)도 "all"과 같이
  // 필터 없음으로 취급돼야 한다 — status && status !== "all" 가드가
  // undefined에도 falsy로 통과하는지 명시적으로 고정한다.
  it("status를 아예 안 넘기면 eq()를 호출하지 않는다", async () => {
    const { client, chain } = mockListSupabase({ data: [] });

    await listReferences({ supabase: client, ...baseArgs });

    expect(chain.eq).not.toHaveBeenCalledWith("status", expect.anything());
  });
});

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
