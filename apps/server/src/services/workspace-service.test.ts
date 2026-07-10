import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";

import type { TypedSupabaseClient } from "@server/infra/supabase";

import { bootstrapWorkspace, toBootstrapUser } from "./workspace-service";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "kyle@getnema.app",
    user_metadata: {},
    app_metadata: {},
    aud: "authenticated",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as User;
}

describe("toBootstrapUser", () => {
  it("given_name > full_name > email 순으로 이름을 고른다", () => {
    const user = makeUser({
      user_metadata: { given_name: "카일", full_name: "카일 왕" },
    });
    expect(toBootstrapUser(user).name).toBe("카일");
  });

  it("given_name이 없으면 full_name을 쓴다", () => {
    const user = makeUser({ user_metadata: { full_name: "카일 왕" } });
    expect(toBootstrapUser(user).name).toBe("카일 왕");
  });

  it("메타데이터가 없는 매직링크 유저는 email로 대체한다", () => {
    const user = makeUser({ user_metadata: {}, email: "kyle@getnema.app" });
    expect(toBootstrapUser(user).name).toBe("kyle@getnema.app");
  });

  it("avatar_url이 없으면 avatarUrl 키 자체를 안 채운다", () => {
    const user = makeUser();
    expect(toBootstrapUser(user)).not.toHaveProperty("avatarUrl");
  });

  it("avatar_url이 있으면 그대로 옮긴다", () => {
    const user = makeUser({
      user_metadata: { avatar_url: "https://example.com/a.png" },
    });
    expect(toBootstrapUser(user).avatarUrl).toBe("https://example.com/a.png");
  });
});

const SOME_ERROR = { code: "XXXXX", message: "boom" };

// workspace_members(order+limit(1))와 spaces 두 테이블을 조회한 뒤 마지막에
// mark_first_entry RPC를 호출한다(순서 자체가 "표식은 조회 성공 후에만 태운다"는
// 계약이라 이 목업도 실제 호출 순서를 그대로 재현한다).
function mockSupabase(args: {
  isFirstEntry?: boolean;
  workspace?: { id: string; name: string | null };
  spaces?: Array<{ id: string; name: string }>;
  membershipRows?: Array<{ workspace_id: string; workspaces: unknown }>;
  membershipError?: typeof SOME_ERROR;
  spacesError?: typeof SOME_ERROR;
  firstEntryError?: typeof SOME_ERROR;
}): TypedSupabaseClient {
  const rpc = () =>
    Promise.resolve(
      args.firstEntryError
        ? { data: null, error: args.firstEntryError }
        : { data: args.isFirstEntry, error: null },
    );
  const from = (table: string) => {
    if (table === "workspace_members") {
      const stub: Record<string, unknown> = {};
      for (const method of ["select", "order"]) {
        stub[method] = () => stub;
      }
      stub["limit"] = () =>
        Promise.resolve(
          args.membershipError
            ? { data: null, error: args.membershipError }
            : {
                data: (args.membershipRows ?? [
                  {
                    workspace_id: args.workspace?.id,
                    workspaces: args.workspace,
                  },
                ]) as unknown[],
                error: null,
              },
        );
      return stub;
    }
    const stub: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) {
      stub[method] = () => stub;
    }
    stub["order"] = () =>
      Promise.resolve(
        args.spacesError
          ? { data: null, error: args.spacesError }
          : { data: args.spaces ?? [], error: null },
      );
    return stub;
  };
  return { rpc, from } as unknown as TypedSupabaseClient;
}

describe("bootstrapWorkspace", () => {
  // workspace.name은 아직 nullable(정책 미정)이라 표시용 placeholder가 필요하지만,
  // spaces.name은 이번 슬라이스의 NOT NULL 제약(space_management_rpcs)으로 DB가
  // 보장하므로 여기선 워크스페이스 쪽만 검증한다.
  it("이름 없는 Workspace(가입 트리거 산출물)는 en placeholder로 채워 내려간다", async () => {
    const result = await bootstrapWorkspace({
      supabase: mockSupabase({
        isFirstEntry: true,
        workspace: { id: "ws-1", name: null },
        spaces: [{ id: "space-1", name: "Default" }],
      }),
      user: makeUser(),
    });

    expect(result.workspace.name).toBe("Workspace");
    expect(result.spaces).toEqual([{ id: "space-1", name: "Default" }]);
    expect(result.isFirstEntry).toBe(true);
  });

  it("이미 이름이 있으면 placeholder로 덮지 않는다", async () => {
    const result = await bootstrapWorkspace({
      supabase: mockSupabase({
        isFirstEntry: false,
        workspace: { id: "ws-1", name: "우리 팀" },
        spaces: [{ id: "space-1", name: "마케팅" }],
      }),
      user: makeUser(),
    });

    expect(result.workspace.name).toBe("우리 팀");
    expect(result.spaces).toEqual([{ id: "space-1", name: "마케팅" }]);
    expect(result.isFirstEntry).toBe(false);
  });

  it("워크스페이스 멤버십이 0건이면 가입 트리거 불변식 위반으로 던진다", async () => {
    await expect(
      bootstrapWorkspace({
        supabase: mockSupabase({ membershipRows: [] }),
        user: makeUser(),
      }),
    ).rejects.toThrow(/has no workspace membership/);
  });

  it("workspace_members 조회 실패 시 SupabaseError를 그대로 던진다", async () => {
    await expect(
      bootstrapWorkspace({
        supabase: mockSupabase({ membershipError: SOME_ERROR }),
        user: makeUser(),
      }),
    ).rejects.toThrow("boom");
  });

  it("spaces 조회 실패 시 SupabaseError를 그대로 던진다", async () => {
    await expect(
      bootstrapWorkspace({
        supabase: mockSupabase({
          workspace: { id: "ws-1", name: "우리 팀" },
          spacesError: SOME_ERROR,
        }),
        user: makeUser(),
      }),
    ).rejects.toThrow("boom");
  });

  it("mark_first_entry RPC 실패 시 SupabaseError를 그대로 던진다", async () => {
    await expect(
      bootstrapWorkspace({
        supabase: mockSupabase({
          workspace: { id: "ws-1", name: "우리 팀" },
          spaces: [{ id: "space-1", name: "마케팅" }],
          firstEntryError: SOME_ERROR,
        }),
        user: makeUser(),
      }),
    ).rejects.toThrow("boom");
  });
});
