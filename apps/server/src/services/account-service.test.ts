import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupabaseAdminMock, deleteUserSpy } = vi.hoisted(() => {
  const deleteUserSpy = vi.fn(
    (): { error: { message: string; code?: string } | null } => ({
      error: null,
    }),
  );
  return {
    deleteUserSpy,
    getSupabaseAdminMock: vi.fn(() => ({
      auth: { admin: { deleteUser: deleteUserSpy } },
    })),
  };
});
vi.mock("@server/infra/supabase/supabase", () => ({
  getSupabaseAdmin: getSupabaseAdminMock,
}));

import { deleteAccount } from "./account-service";

const USER_ID = "aaaaaaaa-0000-4000-a000-000000000001";

describe("deleteAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Auth admin API로 유저를 지운다", async () => {
    await deleteAccount({ userId: USER_ID });

    expect(deleteUserSpy).toHaveBeenCalledWith(USER_ID);
  });

  // sources가 ON DELETE CASCADE로 딸려 있어, deleteUser 실패를 삼키면 원문·다이제스트·
  // 진술이 그대로 남았는데도 성공한 것처럼 보인다 — 조용히 넘기지 않는지 검증한다.
  it("deleteUser가 실패하면 SupabaseError로 감싸 던진다", async () => {
    deleteUserSpy.mockReturnValueOnce({
      error: { message: "admin api unavailable", code: "unexpected_failure" },
    });

    await expect(deleteAccount({ userId: USER_ID })).rejects.toMatchObject({
      name: "SupabaseError",
      code: "unexpected_failure",
    });
  });
});
