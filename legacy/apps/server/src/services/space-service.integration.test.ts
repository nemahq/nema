import { randomUUID } from "node:crypto";

import { Client } from "pg";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

// service_role 키는 RPC 호출만 되고 workspaces/spaces 같은 테이블에 대한 직접
// GRANT가 없다(이 앱이 admin 클라이언트로 raw 테이블 CRUD를 한 적이 없어서) —
// 픽스처를 만들려면 로컬 Postgres에 슈퍼유저로 직접 붙어야 한다. 로컬 CLI 고정
// 계정(postgres/postgres@127.0.0.1:54322)이라 시크릿이 아니고, loadEnv()의
// APP_ENV 기본값(staging) 경로를 안 타 원격을 잘못 건드릴 위험도 없다.
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: LOCAL_DB_URL });
let localDbAvailable = false;

beforeAll(async () => {
  try {
    await client.connect();
    localDbAvailable = true;
  } catch {
    if (process.env.REQUIRE_LOCAL_DB === "true") {
      throw new Error(
        "[space-service.integration.test] local Postgres (127.0.0.1:54322) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run.",
      );
    }
    console.warn(
      "[space-service.integration.test] local Postgres (127.0.0.1:54322) unreachable — skipping. Run `supabase start` first.",
    );
  }
});

afterAll(async () => {
  if (localDbAvailable) {
    await client.end();
  }
});

// 각 테스트를 트랜잭션으로 감싸고 끝나면 무조건 롤백 — 실패 케이스(RAISE EXCEPTION)가
// 트랜잭션을 abort 상태로 만들어도 ROLLBACK 자체는 항상 성공해 픽스처가 안 남는다.
beforeEach(async () => {
  if (localDbAvailable) {
    await client.query("BEGIN");
  }
});

afterEach(async () => {
  if (localDbAvailable) {
    await client.query("ROLLBACK");
  }
});

async function createFixtureWorkspace(): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
    [`integration-test-${randomUUID()}`],
  );
  return rows[0].id;
}

async function createFixtureSpace(
  workspaceId: string,
  name: string,
): Promise<string> {
  const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO spaces (workspace_id, name, public_id) VALUES ($1, $2, $3) RETURNING id",
    [workspaceId, name, publicId],
  );
  return rows[0].id;
}

async function createFixtureSource(args: {
  spaceId: string;
  status: "pending" | "active" | "trashed";
  digestionStatus?: "pending" | "completed" | "failed" | "cancelled";
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, body, status, digestion_status) VALUES ($1, $2, $3, $4) RETURNING id",
    [
      args.spaceId,
      "fixture body",
      args.status,
      args.digestionStatus ?? "pending",
    ],
  );
  return rows[0].id;
}

async function openReviewFor(spaceId: string, sourceId: string) {
  await client.query(
    "INSERT INTO changesets (space_id, type, status, source_id, number) VALUES ($1, 'ingestion', 'open', $2, 1)",
    [spaceId, sourceId],
  );
}

describe("delete_space RPC (integration)", () => {
  it("대기 초안은 target Space로 옮기고, active·리뷰 중인 소스는 cascade 삭제한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");
    const spaceB = await createFixtureSpace(workspaceId, "Space B");

    const draftId = await createFixtureSource({
      spaceId: spaceA,
      status: "pending",
    });
    const activeId = await createFixtureSource({
      spaceId: spaceA,
      status: "active",
      digestionStatus: "completed",
    });
    const inReviewId = await createFixtureSource({
      spaceId: spaceA,
      status: "pending",
      digestionStatus: "completed",
    });
    await openReviewFor(spaceA, inReviewId);

    await client.query("SELECT delete_space($1, $2)", [spaceA, spaceB]);

    const { rows: draftRows } = await client.query(
      "SELECT space_id FROM sources WHERE id = $1",
      [draftId],
    );
    expect(draftRows[0]?.space_id).toBe(spaceB);

    const { rows: activeRows } = await client.query(
      "SELECT id FROM sources WHERE id = $1",
      [activeId],
    );
    expect(activeRows).toHaveLength(0);

    const { rows: inReviewRows } = await client.query(
      "SELECT id FROM sources WHERE id = $1",
      [inReviewId],
    );
    expect(inReviewRows).toHaveLength(0);

    const { rows: spaceARows } = await client.query(
      "SELECT id FROM spaces WHERE id = $1",
      [spaceA],
    );
    expect(spaceARows).toHaveLength(0);
  });

  it("대기 초안이 있는데 target도 delete_pending_drafts도 없으면 NM009로 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");
    await createFixtureSpace(workspaceId, "Space B");
    await createFixtureSource({ spaceId: spaceA, status: "pending" });

    await expect(
      client.query("SELECT delete_space($1)", [spaceA]),
    ).rejects.toMatchObject({ code: "NM009" });
  });

  it("p_delete_pending_drafts=true면 target 없이도 대기 초안을 cascade 삭제한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");
    await createFixtureSpace(workspaceId, "Space B");
    const draftId = await createFixtureSource({
      spaceId: spaceA,
      status: "pending",
    });

    await client.query("SELECT delete_space($1, $2, $3)", [spaceA, null, true]);

    const { rows: draftRows } = await client.query(
      "SELECT id FROM sources WHERE id = $1",
      [draftId],
    );
    expect(draftRows).toHaveLength(0);

    const { rows: spaceARows } = await client.query(
      "SELECT id FROM spaces WHERE id = $1",
      [spaceA],
    );
    expect(spaceARows).toHaveLength(0);
  });

  it("target과 delete_pending_drafts=true를 동시에 보내면 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");
    const spaceB = await createFixtureSpace(workspaceId, "Space B");
    await createFixtureSource({ spaceId: spaceA, status: "pending" });

    await expect(
      client.query("SELECT delete_space($1, $2, $3)", [spaceA, spaceB, true]),
    ).rejects.toThrow(/mutually exclusive/);
  });

  it("target이 삭제 대상 Space 자신이면 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");
    await createFixtureSource({ spaceId: spaceA, status: "pending" });

    await expect(
      client.query("SELECT delete_space($1, $2)", [spaceA, spaceA]),
    ).rejects.toThrow();
  });

  it("target이 다른 워크스페이스 소속이면 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const otherWorkspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");
    const foreignSpace = await createFixtureSpace(
      otherWorkspaceId,
      "Foreign Space",
    );
    await createFixtureSource({ spaceId: spaceA, status: "pending" });

    await expect(
      client.query("SELECT delete_space($1, $2)", [spaceA, foreignSpace]),
    ).rejects.toThrow();
  });

  it("워크스페이스의 마지막 Space는 대기 초안이 없어도 삭제를 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const onlySpace = await createFixtureSpace(workspaceId, "Only Space");

    await expect(
      client.query("SELECT delete_space($1)", [onlySpace]),
    ).rejects.toMatchObject({ code: "NM002" });
  });

  it("count_pending_drafts는 리뷰 중인 pending 소스를 제외하고 Space 스코프로 정확히 센다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceA = await createFixtureSpace(workspaceId, "Space A");

    await createFixtureSource({ spaceId: spaceA, status: "pending" });
    const inReviewId = await createFixtureSource({
      spaceId: spaceA,
      status: "pending",
      digestionStatus: "completed",
    });
    await openReviewFor(spaceA, inReviewId);

    const { rows } = await client.query<{ count_pending_drafts: number }>(
      "SELECT count_pending_drafts($1)",
      [spaceA],
    );
    expect(rows[0]?.count_pending_drafts).toBe(1);
  });
});

// create_space는 GRANT EXECUTE ... TO authenticated로 PostgREST를 통해
// tRPC/zod를 거치지 않고 직접 호출 가능하다 — 여기서는 그 경로를 흉내 내
// DB 레벨 CHECK(spaces_name_no_forbidden_chars, spaces_name_max_length)가
// 실제로 막는지 확인한다.
describe("create_space RPC — DB 레벨 이름 검증 (integration)", () => {
  it("zod를 거치지 않은 직접 호출이어도 zero-width 문자만 있는 이름은 CHECK로 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    await expect(
      client.query("SELECT create_space($1, $2, $3)", [
        workspaceId,
        String.fromCharCode(0x200b, 0x200b),
        publicId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("zod를 거치지 않은 직접 호출이어도 50자 초과 이름은 CHECK로 거부한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    await expect(
      client.query("SELECT create_space($1, $2, $3)", [
        workspaceId,
        "a".repeat(51),
        publicId,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("정상 이름은 CHECK를 통과해 그대로 생성된다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

    const { rows } = await client.query<{ create_space: string }>(
      "SELECT create_space($1, $2, $3)",
      [workspaceId, "우리 팀 🚀", publicId],
    );
    expect(rows[0]?.create_space).toBeTruthy();
  });
});
