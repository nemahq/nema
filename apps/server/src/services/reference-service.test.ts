import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { getReferenceCitingDigests, trashReference } from "./reference-service";

const REFERENCE_ID = "11111111-1111-4111-a111-111111111111";

function mockRpcSupabase(error: { code: string; message: string } | null) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  return { supabase: { rpc } as unknown as TypedSupabaseClient, rpc };
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
