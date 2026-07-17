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

// space-service.integration.test.ts와 같은 이유로 로컬 Postgres에 슈퍼유저로 직접 붙는다
// (service_role 키로는 workspaces/spaces/auth.users 같은 테이블에 직접 GRANT가 없음).
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: LOCAL_DB_URL });
let localDbAvailable = false;

beforeAll(async () => {
  try {
    await client.connect();
    localDbAvailable = true;
  } catch {
    console.warn(
      "[changeset-service.integration.test] local Postgres (127.0.0.1:54322) unreachable — skipping. Run `supabase start` first.",
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

async function createFixtureUser(): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id",
  );
  return rows[0].id;
}

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

// author_id가 있는(사람이 제출한) Source로 픽스처를 만든다 — 이게 이 테스트의 핵심이다:
// create_ingestion_review가 예전처럼 이 값을 changeset.author_id에 그대로 흘려보내는
// 회귀가 생기면, source.author_id가 non-null이어야만 그 회귀를 잡아낼 수 있다.
async function createFixtureSource(
  spaceId: string,
  authorId: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, author_id, body, status, digestion_status) VALUES ($1, $2, $3, 'pending', 'pending') RETURNING id",
    [spaceId, authorId, "fixture body"],
  );
  return rows[0].id;
}

describe("create_ingestion_review RPC (integration)", () => {
  it("Source 제출자가 있어도 ingestion changeset의 author_id는 항상 null이다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource(spaceId, userId);

    const digest = {
      type: "decision",
      title: "픽스처 다이제스트",
      description: "설명",
      body: { type: "decision" },
      topics: [],
      tags: [],
      reference_ids: [],
    };

    const { rows } = await client.query<{ create_ingestion_review: string }>(
      "SELECT create_ingestion_review($1, $2::jsonb)",
      [sourceId, JSON.stringify([digest])],
    );
    const changesetId = rows[0].create_ingestion_review;

    const { rows: changesetRows } = await client.query<{
      author_id: string | null;
    }>("SELECT author_id FROM changesets WHERE id = $1", [changesetId]);

    expect(changesetRows[0]?.author_id).toBeNull();
  });
});
