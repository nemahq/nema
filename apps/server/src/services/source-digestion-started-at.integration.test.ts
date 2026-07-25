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

async function createFixtureSpace(): Promise<string> {
  const { rows: workspace } = await client.query<{ id: string }>(
    "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
    [`integration-test-${randomUUID()}`],
  );
  const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const { rows: space } = await client.query<{ id: string }>(
    "INSERT INTO spaces (workspace_id, name, public_id) VALUES ($1, $2, $3) RETURNING id",
    [workspace[0].id, "space-a", publicId],
  );
  return space[0].id;
}

async function createFixtureSource(): Promise<string> {
  const spaceId = await createFixtureSpace();
  // start_source_digestion은 idle(completed/failed/cancelled)에서만 정리를 새로
  // 시작할 수 있다 — pending(추출 중) 원문에 걸면 가드가 막는다.
  const { rows: source } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, body, status, digestion_status) VALUES ($1, $2, 'pending', 'completed') RETURNING id",
    [spaceId, "원문"],
  );
  return source[0].id;
}

// create_source는 is_space_member로 실제 멤버십을 요구해 다른 RPC들의
// "auth.uid() IS NULL이면 통과" 우회가 없다 — 슈퍼유저 직결로는 못 뚫고
// request.jwt.claim.sub으로 로그인 유저를 흉내내야 한다(changeset-service
// 통합 테스트의 동일 패턴).
async function createFixtureLoggedInMember(spaceId: string): Promise<void> {
  const { rows: user } = await client.query<{ id: string }>(
    "INSERT INTO auth.users (id) VALUES (gen_random_uuid()) RETURNING id",
  );
  await client.query(
    "INSERT INTO space_members (space_id, user_id, role) VALUES ($1, $2, 'owner')",
    [spaceId, user[0].id],
  );
  await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
    user[0].id,
  ]);
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

    // fetch_pending_digestion_sources()는 ORDER BY 없이 전역에서 LIMIT 10을
    // 집어간다 — 로컬 DB에 정리 대기 중인 다른 원문이 10건 이상 있으면 이
    // 픽스처가 안 뽑혀 아래 단언이 어긋난다. 트랜잭션 안에서만(테스트 끝에
    // 롤백되어 사라짐) 다른 원문들의 리스를 미리 채워 이번 클레임 대상에서
    // 제외한다.
    await client.query(
      "UPDATE sources SET last_digestion_attempt = now() WHERE digestion_status = 'pending' AND status = 'pending' AND id != $1",
      [sourceId],
    );

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

  it("새 초안은 digestion_status 기본값('pending')으로 바로 정리에 들어가므로 create_source가 직접 찍는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const spaceId = await createFixtureSpace();
    await createFixtureLoggedInMember(spaceId);

    const { rows } = await client.query<{ create_source: string }>(
      "SELECT create_source($1, $2)",
      [spaceId, "새 초안"],
    );
    const sourceId = rows[0].create_source;

    const afterCreate = await readTimestamps(sourceId);
    expect(afterCreate.digestion_started_at).not.toBeNull();
  });
});
