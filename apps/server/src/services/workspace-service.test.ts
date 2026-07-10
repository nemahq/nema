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

// workspace_members(단수 전제, order+limit(1)+single)와 spaces 두 테이블을 순서대로 조회한다.
function mockSupabase(args: {
  isFirstEntry: boolean;
  workspace: { id: string; name: string | null };
  spaces: Array<{ id: string; name: string | null }>;
}): TypedSupabaseClient {
  const rpc = () => Promise.resolve({ data: args.isFirstEntry, error: null });
  const from = (table: string) => {
    if (table === "workspace_members") {
      const stub: Record<string, unknown> = {};
      for (const method of ["select", "order", "limit"]) {
        stub[method] = () => stub;
      }
      stub["single"] = () =>
        Promise.resolve({
          data: {
            workspace_id: args.workspace.id,
            workspaces: args.workspace,
          },
          error: null,
        });
      return stub;
    }
    const stub: Record<string, unknown> = {};
    for (const method of ["select", "eq"]) {
      stub[method] = () => stub;
    }
    stub["order"] = () => Promise.resolve({ data: args.spaces, error: null });
    return stub;
  };
  return { rpc, from } as unknown as TypedSupabaseClient;
}

describe("bootstrapWorkspace", () => {
  it("이름 없는 Space·Workspace(가입 트리거 산출물)는 en placeholder로 채워 내려간다", async () => {
    const result = await bootstrapWorkspace({
      supabase: mockSupabase({
        isFirstEntry: true,
        workspace: { id: "ws-1", name: null },
        spaces: [{ id: "space-1", name: null }],
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
});
