import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { getReferenceCitingDigests, trashReference } from "./reference-service";

const REFERENCE_ID = "11111111-1111-4111-a111-111111111111";

function mockRpcSupabase(error: { message: string } | null) {
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

  it("active가 아니라 가드가 지면 오류를 그대로 올린다", async () => {
    const { supabase } = mockRpcSupabase({
      message: "reference ... is not an active reference the caller can trash",
    });

    await expect(
      trashReference({ supabase, referenceId: REFERENCE_ID }),
    ).rejects.toThrow();
  });
});

describe("getReferenceCitingDigests", () => {
  it("digest_references 조인 결과에서 digests만 뽑아 반환한다", async () => {
    const stub: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) {
      stub[method] = () => stub;
    }
    stub["then"] = (resolve: (value: { data: unknown; error: null }) => void) =>
      resolve({
        data: [
          { digests: { id: "d1", title: "Digest 1" } },
          { digests: { id: "d2", title: "Digest 2" } },
        ],
        error: null,
      });
    const supabase = {
      from: () => stub,
    } as unknown as TypedSupabaseClient;

    const result = await getReferenceCitingDigests({
      supabase,
      referenceId: REFERENCE_ID,
    });

    expect(result.digests).toEqual([
      { id: "d1", title: "Digest 1" },
      { id: "d2", title: "Digest 2" },
    ]);
  });
});
