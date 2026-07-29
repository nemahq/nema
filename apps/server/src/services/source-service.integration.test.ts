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

// trash_source의 "열린 ingestion changeset 없음" 가드는 mock supabase 단위
// 테스트로는 못 잡는다 — WHERE 가드·EXISTS 체크가 실제 함수 본문 안에 있어서
// 로컬 Postgres에 대고 돌려야 확인된다.
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
        "[source-service.integration.test] local Postgres (127.0.0.1:54322) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run.",
      );
    }
    console.warn(
      "[source-service.integration.test] local Postgres (127.0.0.1:54322) unreachable — skipping. Run `supabase start` first.",
    );
  }
});

afterAll(async () => {
  if (localDbAvailable) {
    await client.end();
  }
});

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

async function createFixtureSpace(workspaceId: string): Promise<string> {
  const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO spaces (workspace_id, name, public_id) VALUES ($1, $2, $3) RETURNING id",
    [workspaceId, "space-a", publicId],
  );
  return rows[0].id;
}

async function createFixtureSource(args: {
  spaceId: string;
  digestionStatus: "pending" | "completed" | "failed" | "cancelled";
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, body, status, digestion_status) VALUES ($1, $2, 'pending', $3) RETURNING id",
    [args.spaceId, "fixture body", args.digestionStatus],
  );
  return rows[0].id;
}

async function openReviewFor(spaceId: string, sourceId: string) {
  await client.query(
    "INSERT INTO changesets (space_id, type, status, source_id, number) VALUES ($1, 'ingestion', 'open', $2, 1)",
    [spaceId, sourceId],
  );
}

interface SourceRow {
  status: string;
  trashed_at: Date | null;
}

async function readSource(sourceId: string): Promise<SourceRow> {
  const { rows } = await client.query<SourceRow>(
    "SELECT status, trashed_at FROM sources WHERE id = $1",
    [sourceId],
  );
  return rows[0];
}

describe("trash_source RPC (integration)", () => {
  it("열린 ingestion changeset이 있으면 NM014로 거부하고 소스는 trashed되지 않는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    // digestion_status='completed'라 원래 가드(digestion_status<>'pending')만
    // 봤다면 삭제 가능한 idle 상태 — 정리 워커가 방금 리뷰를 연 직후 시나리오를 흉내낸다.
    const sourceId = await createFixtureSource({
      spaceId,
      digestionStatus: "completed",
    });
    await openReviewFor(spaceId, sourceId);

    await expect(
      client.query("SELECT trash_source($1)", [sourceId]),
    ).rejects.toMatchObject({ code: "NM014" });
  });

  it("열린 changeset이 없는 idle 소스는 정상적으로 trash된다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource({
      spaceId,
      digestionStatus: "completed",
    });

    await client.query("SELECT trash_source($1)", [sourceId]);

    const afterTrash = await readSource(sourceId);
    expect(afterTrash.status).toBe("trashed");
    expect(afterTrash.trashed_at).not.toBeNull();
  });
});
