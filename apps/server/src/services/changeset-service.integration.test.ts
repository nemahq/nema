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
async function createFixtureSource(args: {
  spaceId: string;
  authorId: string;
  title?: string | null;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, author_id, body, title, status, digestion_status) VALUES ($1, $2, $3, $4, 'pending', 'pending') RETURNING id",
    [args.spaceId, args.authorId, "fixture body", args.title ?? null],
  );
  return rows[0].id;
}

async function createFixtureDigest(args: {
  sourceId: string;
  spaceId: string;
  title: string;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO digests (source_id, space_id, title, description, body)
     VALUES ($1, $2, $3, 'fixture description', '{"type":"decision"}'::jsonb)
     RETURNING id`,
    [args.sourceId, args.spaceId, args.title],
  );
  return rows[0].id;
}

async function createFixtureStatement(
  spaceId: string,
  digestId: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO statements (space_id, digest_id, content, type) VALUES ($1, $2, 'fixture statement', 'todo') RETURNING id",
    [spaceId, digestId],
  );
  return rows[0]?.id ?? "";
}

describe("create_ingestion_review RPC (integration)", () => {
  it("Source 제출자가 있어도 ingestion changeset의 author_id는 항상 null이다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });

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

  it("changeset.title을 생성 시점의 Source 제목으로 채운다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({
      spaceId,
      authorId: userId,
      title: "미리 채워진 제목",
    });

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
      title: string | null;
    }>("SELECT title FROM changesets WHERE id = $1", [changesetId]);

    expect(changesetRows[0]?.title).toBe("미리 채워진 제목");
  });
});

describe("sources.title 전파 트리거 (integration)", () => {
  it("pending 상태인 ingestion changeset의 title은 Source 제목 변경을 따라간다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });

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

    // 생성 시점엔 title이 null이었으므로 changeset.title도 null이어야 한다
    const before = await client.query<{ title: string | null }>(
      "SELECT title FROM changesets WHERE id = $1",
      [changesetId],
    );
    expect(before.rows[0]?.title).toBeNull();

    // 이후(엔진 콜 착지 시뮬레이션) Source 제목이 채워지면 트리거가 전파해야 한다
    await client.query("UPDATE sources SET title = $1 WHERE id = $2", [
      "뒤늦게 채워진 제목",
      sourceId,
    ]);

    const after = await client.query<{ title: string | null }>(
      "SELECT title FROM changesets WHERE id = $1",
      [changesetId],
    );
    expect(after.rows[0]?.title).toBe("뒤늦게 채워진 제목");
  });

  it("리뷰가 이미 닫힌(pending이 아닌) ingestion changeset의 title은 소급 갱신하지 않는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({
      spaceId,
      authorId: userId,
      title: "확정된 리뷰 제목",
    });

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

    // pending → applied로 닫는다(review 확정과 동등한 최소 재현 — status만 직접 전이)
    await client.query(
      "UPDATE changesets SET status = 'applied' WHERE id = $1",
      [changesetId],
    );

    // 그 뒤 Source 제목이 다시 바뀌어도(예: 재인제스천으로 이어진 새 changeset의 리뷰
    // 도중 편집) 이미 닫힌 이 changeset의 title은 그대로여야 한다.
    await client.query("UPDATE sources SET title = $1 WHERE id = $2", [
      "재인제스천 이후 제목",
      sourceId,
    ]);

    const after = await client.query<{ title: string | null }>(
      "SELECT title FROM changesets WHERE id = $1",
      [changesetId],
    );
    expect(after.rows[0]?.title).toBe("확정된 리뷰 제목");
  });
});

describe("apply_relation_changesets RPC — pending 제안 title (integration)", () => {
  it("끝점 두 Statement가 속한 Digest 제목을 'A vs B'로 합쳐 채운다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
    await client.query(
      "UPDATE sources SET linking_status = 'pending' WHERE id = $1",
      [sourceId],
    );

    const digestA = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "다이제스트 A",
    });
    const digestB = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "다이제스트 B",
    });
    const fromStatementId = await createFixtureStatement(spaceId, digestA);
    const toStatementId = await createFixtureStatement(spaceId, digestB);

    const pending = [
      { type: "conflicts", from_id: fromStatementId, to_id: toStatementId },
    ];
    await client.query(
      "SELECT apply_relation_changesets($1, '[]'::jsonb, $2::jsonb)",
      [sourceId, JSON.stringify(pending)],
    );

    const { rows } = await client.query<{ title: string | null }>(
      `SELECT c.title FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE c.type = 'relation' AND c.status = 'pending'
         AND ch.data->>'from_id' = $1 AND ch.data->>'to_id' = $2`,
      [fromStatementId, toStatementId],
    );

    expect(rows[0]?.title).toBe("다이제스트 A vs 다이제스트 B");
  });
});

describe("revert_changeset RPC — title (integration)", () => {
  it("되돌리는 changeset의 title에 ' 되돌림'을 붙인다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({
      spaceId,
      authorId: userId,
      title: "원본 리뷰 제목",
    });

    const digest = {
      type: "decision",
      title: "픽스처 다이제스트",
      description: "설명",
      body: { type: "decision" },
      topics: [],
      tags: [],
      reference_ids: [],
    };
    const { rows: createRows } = await client.query<{
      create_ingestion_review: string;
    }>("SELECT create_ingestion_review($1, $2::jsonb)", [
      sourceId,
      JSON.stringify([digest]),
    ]);
    const changesetId = createRows[0].create_ingestion_review;

    // revert_changeset은 changes에 실린 create/archive를 역연산한다 — pending
    // 리뷰 자체엔 아직 실체(digest 행 등)가 없어 되돌릴 게 없으므로, 실사용과
    // 같이 먼저 확정해 실제 digest가 생기게 한다.
    await client.query("SELECT confirm_ingestion_review($1)", [changesetId]);

    const { rows: revertRows } = await client.query<{
      revert_changeset: string;
    }>("SELECT revert_changeset($1)", [changesetId]);
    const revertId = revertRows[0].revert_changeset;

    const { rows } = await client.query<{ title: string | null }>(
      "SELECT title FROM changesets WHERE id = $1",
      [revertId],
    );

    expect(rows[0]?.title).toBe("원본 리뷰 제목 되돌림");
  });
});
