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

// digestion_started_at은 화면의 "정리중.." 경과 시간이 재시도·워커 클레임마다
// 0초로 되돌아가던 버그(last_digestion_attempt를 기준으로 삼았을 때)의 수정이다
// — 이 RPC들의 UPDATE SET 목록에 어떤 컬럼이 들어있는지가 핵심이라 mock supabase
// 단위 테스트로는 못 잡고, 실제 함수를 로컬 Postgres에 대고 돌려야 확인된다.
const LOCAL_DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const client = new Client({ connectionString: LOCAL_DB_URL });
let localDbAvailable = false;

beforeAll(async () => {
  try {
    await client.connect();
    localDbAvailable = true;
  } catch {
    console.warn(
      "[source-digestion-started-at.integration.test] local Postgres (127.0.0.1:54322) unreachable — skipping. Run `supabase start` first.",
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

async function createFixtureSource(): Promise<string> {
  const { rows: workspace } = await client.query<{ id: string }>(
    "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
    [`integration-test-${randomUUID()}`],
  );
  const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { rows: space } = await client.query<{ id: string }>(
    "INSERT INTO spaces (workspace_id, name, public_id) VALUES ($1, $2, $3) RETURNING id",
    [workspace[0].id, "space-a", publicId],
  );
  // start_source_digestion은 idle(completed/failed/cancelled)에서만 정리를 새로
  // 시작할 수 있다 — pending(추출 중) 원본에 걸면 가드가 막는다.
  const { rows: source } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, body, status, digestion_status) VALUES ($1, $2, 'pending', 'completed') RETURNING id",
    [space[0].id, "원문"],
  );
  return source[0].id;
}

interface DigestionTimestamps {
  digestion_started_at: Date | null;
  last_digestion_attempt: Date | null;
}

async function readTimestamps(sourceId: string): Promise<DigestionTimestamps> {
  const { rows } = await client.query<DigestionTimestamps>(
    "SELECT digestion_started_at, last_digestion_attempt FROM sources WHERE id = $1",
    [sourceId],
  );
  return rows[0];
}

describe("digestion_started_at (integration)", () => {
  it("워커 클레임·재시도는 last_digestion_attempt만 올리고 digestion_started_at은 그대로 둔다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const sourceId = await createFixtureSource();

    await client.query("SELECT start_source_digestion($1)", [sourceId]);
    const afterStart = await readTimestamps(sourceId);
    expect(afterStart.digestion_started_at).not.toBeNull();
    expect(afterStart.last_digestion_attempt).toBeNull();

    await client.query("SELECT fetch_pending_digestion_sources()");
    const afterClaim = await readTimestamps(sourceId);
    expect(afterClaim.last_digestion_attempt).not.toBeNull();
    expect(afterClaim.digestion_started_at).toEqual(
      afterStart.digestion_started_at,
    );

    await client.query("SELECT increment_source_digestion_retry($1, 5, $2)", [
      sourceId,
      "일시적 오류",
    ]);
    const afterRetry = await readTimestamps(sourceId);
    expect(afterRetry.last_digestion_attempt).not.toBeNull();
    expect(afterRetry.digestion_started_at).toEqual(
      afterStart.digestion_started_at,
    );
  });

  it("취소하면 digestion_started_at도 함께 비운다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const sourceId = await createFixtureSource();
    await client.query("SELECT start_source_digestion($1)", [sourceId]);

    await client.query("SELECT cancel_source_digestion($1)", [sourceId]);

    const afterCancel = await readTimestamps(sourceId);
    expect(afterCancel.digestion_started_at).toBeNull();
  });
});
