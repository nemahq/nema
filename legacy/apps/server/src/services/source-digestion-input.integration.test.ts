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

// 서버 단위 테스트는 전부 mock supabase라 트리거가 실제로 도는지는 검증하지 못한다.
// 이 파일은 digestion_input_updated_at 트리거만 로컬 Postgres에 직접 붙어 확인한다 —
// 어떤 컬럼이 "정리 입력"인지가 이 기능의 핵심 판정이고, 트리거 조건(UPDATE OF …
// WHEN … IS DISTINCT FROM)은 SQL로만 표현돼 타입 체커도 단위 테스트도 못 잡는다.
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
        "[source-digestion-input.integration.test] local Postgres (127.0.0.1:54322) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run.",
      );
    }
    console.warn(
      "[source-digestion-input.integration.test] local Postgres (127.0.0.1:54322) unreachable — skipping. Run `supabase start` first.",
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

const BASELINE = "2020-01-01T00:00:00.000Z";

async function createFixtureSource(): Promise<{
  sourceId: string;
  otherSpaceId: string;
}> {
  const { rows: workspace } = await client.query<{ id: string }>(
    "INSERT INTO workspaces (name) VALUES ($1) RETURNING id",
    [`integration-test-${randomUUID()}`],
  );
  const spaceIds: string[] = [];
  for (const name of ["space-a", "space-b"]) {
    const publicId = `spc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO spaces (workspace_id, name, public_id) VALUES ($1, $2, $3) RETURNING id",
      [workspace[0].id, name, publicId],
    );
    spaceIds.push(rows[0].id);
  }
  const { rows: source } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, body, status, digestion_input_updated_at) VALUES ($1, $2, 'pending', $3) RETURNING id",
    [spaceIds[0], "원문", BASELINE],
  );
  return { sourceId: source[0].id, otherSpaceId: spaceIds[1] };
}

async function readInputUpdatedAt(sourceId: string): Promise<Date> {
  const { rows } = await client.query<{ digestion_input_updated_at: Date }>(
    "SELECT digestion_input_updated_at FROM sources WHERE id = $1",
    [sourceId],
  );
  return rows[0].digestion_input_updated_at;
}

describe("digestion_input_updated_at 트리거 (integration)", () => {
  it("정리 결과 추출 여부를 바꿀 수 있는 컬럼(body)만 시각을 올린다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const { sourceId, otherSpaceId } = await createFixtureSource();
    const baseline = new Date(BASELINE);

    // 제목은 정리 파이프라인에 안 들어간다(digestion.ts가 body만 넘김).
    await client.query("UPDATE sources SET title = $1 WHERE id = $2", [
      "제목만 변경",
      sourceId,
    ]);
    expect(await readInputUpdatedAt(sourceId)).toEqual(baseline);

    // 워커가 처리 중 같은 row를 여러 번 쓰는 경로 — 이게 시각을 올리면
    // 사용자 편집과 구분이 안 돼 게이트가 통째로 무의미해진다.
    await client.query(
      "UPDATE sources SET digestion_status = 'completed', last_digestion_attempt = now() WHERE id = $1",
      [sourceId],
    );
    expect(await readInputUpdatedAt(sourceId)).toEqual(baseline);

    // UPDATE OF는 SET 목록에 컬럼이 있으면 값이 같아도 발동하므로 WHEN 절이
    // 실제 변경만 걸러내는지 확인한다.
    await client.query("UPDATE sources SET body = $1 WHERE id = $2", [
      "원문",
      sourceId,
    ]);
    expect(await readInputUpdatedAt(sourceId)).toEqual(baseline);

    await client.query("UPDATE sources SET body = $1 WHERE id = $2", [
      "진짜 바뀐 원문",
      sourceId,
    ]);
    expect((await readInputUpdatedAt(sourceId)).getTime()).toBeGreaterThan(
      baseline.getTime(),
    );

    // Space 이동은 Topic 라벨링에만 영향을 줄 뿐 추출 판정 자체는 그대로다
    // (digest-generation.ts의 existing_topics는 라벨링에만 쓰임) — 시각을 안 올린다.
    await client.query(
      "UPDATE sources SET digestion_input_updated_at = $1 WHERE id = $2",
      [BASELINE, sourceId],
    );
    await client.query("UPDATE sources SET space_id = $1 WHERE id = $2", [
      otherSpaceId,
      sourceId,
    ]);
    expect(await readInputUpdatedAt(sourceId)).toEqual(baseline);
  });
});
