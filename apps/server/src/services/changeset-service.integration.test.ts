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

// apply_relation_changesets가 만드는 pending relation changeset을 직접 재현한다 —
// resolve_conflict_relation/resolve_duplicate_relation은 이 모양(changeset + change
// row{type, from_id, to_id})만 전제로 하므로 엔진 배치 전체를 안 돌려도 된다.
async function createFixturePendingRelation(args: {
  spaceId: string;
  sourceId: string;
  relationType: "conflicts" | "duplicates";
  fromId: string;
  toId: string;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO changesets (space_id, type, status, source_id) VALUES ($1, 'relation', 'pending', $2) RETURNING id",
    [args.spaceId, args.sourceId],
  );
  const changesetId = rows[0].id;
  await client.query(
    `INSERT INTO changes (changeset_id, action, target_type, target_id, data)
     VALUES ($1, 'create', 'relation', gen_random_uuid(), $2::jsonb)`,
    [
      changesetId,
      JSON.stringify({
        type: args.relationType,
        from_id: args.fromId,
        to_id: args.toId,
      }),
    ],
  );
  return changesetId;
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

describe("apply_relation_changesets RPC — 재제안 가드 (integration)", () => {
  it("사람이 실제로 거절한(invalidated_by_id 없는) rejected 쌍은 재제안을 계속 막는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const fromId = await createFixtureStatement(spaceId, digestA);
    const toId = await createFixtureStatement(spaceId, digestB);

    const firstChangeset = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId,
      toId,
    });
    await client.query("SELECT reject_pending_relation($1)", [firstChangeset]);

    await client.query(
      "UPDATE sources SET linking_status = 'pending' WHERE id = $1",
      [sourceId],
    );
    const pending = [{ type: "conflicts", from_id: fromId, to_id: toId }];
    await client.query(
      "SELECT apply_relation_changesets($1, '[]'::jsonb, $2::jsonb)",
      [sourceId, JSON.stringify(pending)],
    );

    const { rows } = await client.query<{ count: string }>(
      `SELECT count(*)::text FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE c.type = 'relation' AND ch.data->>'from_id' = $1 AND ch.data->>'to_id' = $2`,
      [fromId, toId],
    );
    expect(rows[0]?.count).toBe("1"); // 거절된 첫 changeset 하나뿐 — 새로 안 생김.
  });

  it("캐스케이드로 무효화된(invalidated_by_id 있는) rejected 쌍은 재제안을 막지 않는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const fromId = await createFixtureStatement(spaceId, digestA);
    const toId = await createFixtureStatement(spaceId, digestB);

    const firstChangeset = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId,
      toId,
    });
    const otherChangesetId = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId,
      toId,
    });
    // 실제 캐스케이드(resolve_conflict_relation 등)를 다시 거치지 않고, 그 결과
    // 상태만 재현한다 — 이 테스트의 대상은 가드 조건이지 캐스케이드 발생 경로가 아니다.
    await client.query(
      "UPDATE changesets SET status = 'rejected', invalidated_by_id = $2 WHERE id = $1",
      [firstChangeset, otherChangesetId],
    );

    await client.query(
      "UPDATE sources SET linking_status = 'pending' WHERE id = $1",
      [sourceId],
    );
    const pending = [{ type: "conflicts", from_id: fromId, to_id: toId }];
    await client.query(
      "SELECT apply_relation_changesets($1, '[]'::jsonb, $2::jsonb)",
      [sourceId, JSON.stringify(pending)],
    );

    const { rows } = await client.query<{ status: string }>(
      `SELECT c.status FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE c.type = 'relation' AND ch.data->>'from_id' = $1 AND ch.data->>'to_id' = $2
       ORDER BY c.created_at DESC`,
      [fromId, toId],
    );
    // 무효화된 첫 changeset(rejected) + 방금 새로 만들어진 pending — 총 2건이어야 한다.
    expect(rows.map((r) => r.status).sort()).toEqual(["pending", "rejected"]);
  });
});

describe("revert_changeset RPC — title·revert_depth (integration)", () => {
  it("되돌리는 changeset은 원본 title을 그대로 물려받고 revert_depth=1이 된다", async () => {
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

    const { rows } = await client.query<{
      title: string | null;
      revert_depth: number;
    }>("SELECT title, revert_depth FROM changesets WHERE id = $1", [revertId]);

    expect(rows[0]?.title).toBe("원본 리뷰 제목");
    expect(rows[0]?.revert_depth).toBe(1);
  });

  it("되돌리기의 되돌리기(redo)는 같은 title을 유지한 채 revert_depth만 2로 늘어난다", async () => {
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
    await client.query("SELECT confirm_ingestion_review($1)", [changesetId]);

    const { rows: revertRows } = await client.query<{
      revert_changeset: string;
    }>("SELECT revert_changeset($1)", [changesetId]);
    const revertId = revertRows[0].revert_changeset;

    const { rows: redoRows } = await client.query<{
      revert_changeset: string;
    }>("SELECT revert_changeset($1)", [revertId]);
    const redoId = redoRows[0].revert_changeset;

    const { rows } = await client.query<{
      title: string | null;
      revert_depth: number;
    }>("SELECT title, revert_depth FROM changesets WHERE id = $1", [redoId]);

    expect(rows[0]?.title).toBe("원본 리뷰 제목");
    expect(rows[0]?.revert_depth).toBe(2);
  });
});

describe("resolve_conflict_relation RPC (integration)", () => {
  it("승자는 active로 남고 패자는 archive되며 승자→패자 replaces 관계가 생긴다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const winnerId = await createFixtureStatement(spaceId, digestA);
    const loserId = await createFixtureStatement(spaceId, digestB);
    const changesetId = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId: winnerId,
      toId: loserId,
    });

    const { rows } = await client.query<{ resolve_conflict_relation: string }>(
      "SELECT resolve_conflict_relation($1, $2)",
      [changesetId, winnerId],
    );
    const relationId = rows[0].resolve_conflict_relation;

    const { rows: statementRows } = await client.query<{
      id: string;
      status: string;
    }>("SELECT id, status FROM statements WHERE id IN ($1, $2)", [
      winnerId,
      loserId,
    ]);
    const statusById = new Map(statementRows.map((s) => [s.id, s.status]));
    expect(statusById.get(winnerId)).toBe("active");
    expect(statusById.get(loserId)).toBe("archived");

    const { rows: relationRows } = await client.query<{
      type: string;
      from_id: string;
      to_id: string;
      status: string;
    }>(
      "SELECT type, from_id, to_id, status FROM statement_relations WHERE id = $1",
      [relationId],
    );
    expect(relationRows[0]).toMatchObject({
      type: "replaces",
      from_id: winnerId,
      to_id: loserId,
      status: "active",
    });

    const { rows: changesetRows } = await client.query<{ status: string }>(
      "SELECT status FROM changesets WHERE id = $1",
      [changesetId],
    );
    expect(changesetRows[0]?.status).toBe("applied");
  });

  it("판정 완료 후에도 원래 conflicts 제안 change row는 그대로 남는다(changeset-detail-service가 applied 이후에도 읽음)", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const winnerId = await createFixtureStatement(spaceId, digestA);
    const loserId = await createFixtureStatement(spaceId, digestB);
    const changesetId = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId: winnerId,
      toId: loserId,
    });

    await client.query("SELECT resolve_conflict_relation($1, $2)", [
      changesetId,
      winnerId,
    ]);

    const { rows } = await client.query<{ data: { type: string } }>(
      "SELECT data FROM changes WHERE changeset_id = $1 AND target_type = 'relation' AND data->>'type' = 'conflicts'",
      [changesetId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].data).toMatchObject({
      type: "conflicts",
      from_id: winnerId,
      to_id: loserId,
    });
  });

  it("패자를 끝점으로 삼던 다른 대기 제안도 대상 소실로 무효화한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const digestC = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "다이제스트 C",
    });
    const winnerId = await createFixtureStatement(spaceId, digestA);
    const loserId = await createFixtureStatement(spaceId, digestB);
    const otherId = await createFixtureStatement(spaceId, digestC);

    const conflictChangeset = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId: winnerId,
      toId: loserId,
    });
    // 패자(loserId)가 또 다른 진술(otherId)과도 별도 중복 제안으로 대기 중인 상태.
    const otherChangeset = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "duplicates",
      fromId: loserId,
      toId: otherId,
    });

    await client.query("SELECT resolve_conflict_relation($1, $2)", [
      conflictChangeset,
      winnerId,
    ]);

    const { rows } = await client.query<{
      status: string;
      invalidated_by_id: string | null;
    }>("SELECT status, invalidated_by_id FROM changesets WHERE id = $1", [
      otherChangeset,
    ]);

    expect(rows[0]?.status).toBe("rejected");
    expect(rows[0]?.invalidated_by_id).toBe(conflictChangeset);
  });

  it("판정→되돌리기→재제안→재판정 시 archived였던 replaces 관계를 되살린다(조용한 no-op 방지)", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const winnerId = await createFixtureStatement(spaceId, digestA);
    const loserId = await createFixtureStatement(spaceId, digestB);

    const firstChangeset = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId: winnerId,
      toId: loserId,
    });
    const { rows: firstResolve } = await client.query<{
      resolve_conflict_relation: string;
    }>("SELECT resolve_conflict_relation($1, $2)", [firstChangeset, winnerId]);
    const relationId = firstResolve[0].resolve_conflict_relation;

    // 되돌리기 — replaces가 archived, 패자가 다시 active로 복귀.
    await client.query("SELECT revert_changeset($1)", [firstChangeset]);

    const afterRevert = await client.query<{ status: string }>(
      "SELECT status FROM statement_relations WHERE id = $1",
      [relationId],
    );
    expect(afterRevert.rows[0]?.status).toBe("archived");

    // 엔진이 같은 쌍을 다시 충돌로 제안 → 같은 승자로 재판정.
    const secondChangeset = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId: winnerId,
      toId: loserId,
    });
    await client.query("SELECT resolve_conflict_relation($1, $2)", [
      secondChangeset,
      winnerId,
    ]);

    const { rows: statementRows } = await client.query<{
      id: string;
      status: string;
    }>("SELECT id, status FROM statements WHERE id IN ($1, $2)", [
      winnerId,
      loserId,
    ]);
    const statusById = new Map(statementRows.map((s) => [s.id, s.status]));
    expect(statusById.get(winnerId)).toBe("active");
    expect(statusById.get(loserId)).toBe("archived");

    // 조용한 no-op이었다면 이 관계가 archived로 방치된다 — active여야 한다.
    const afterRejudge = await client.query<{ status: string }>(
      "SELECT status FROM statement_relations WHERE id = $1",
      [relationId],
    );
    expect(afterRejudge.rows[0]?.status).toBe("active");
  });
});

describe("resolve_duplicate_relation RPC (integration)", () => {
  it("두 옛 Digest·그 진술을 archive하고 병합된 새 Digest를 만든다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
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
    const keeperId = await createFixtureStatement(spaceId, digestA);
    const duplicateId = await createFixtureStatement(spaceId, digestB);
    const changesetId = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "duplicates",
      fromId: keeperId,
      toId: duplicateId,
    });

    const mergedDigest = {
      title: "병합된 다이제스트",
      description: "병합 설명",
      body: { type: "decision" },
      topics: [],
      tags: [],
      reference_ids: [],
      new_reference_keys: [],
      external_urls: [],
    };

    const { rows } = await client.query<{
      resolve_duplicate_relation: string;
    }>("SELECT resolve_duplicate_relation($1, $2::jsonb, '[]'::jsonb)", [
      changesetId,
      JSON.stringify(mergedDigest),
    ]);
    const newDigestId = rows[0].resolve_duplicate_relation;

    const { rows: digestRows } = await client.query<{
      id: string;
      status: string;
      title: string;
    }>("SELECT id, status, title FROM digests WHERE id IN ($1, $2, $3)", [
      digestA,
      digestB,
      newDigestId,
    ]);
    const byId = new Map(digestRows.map((d) => [d.id, d]));
    expect(byId.get(digestA)?.status).toBe("archived");
    expect(byId.get(digestB)?.status).toBe("archived");
    expect(byId.get(newDigestId)).toMatchObject({
      status: "active",
      title: "병합된 다이제스트",
    });

    const { rows: statementRows } = await client.query<{
      id: string;
      status: string;
    }>("SELECT id, status FROM statements WHERE id IN ($1, $2)", [
      keeperId,
      duplicateId,
    ]);
    const statusById = new Map(statementRows.map((s) => [s.id, s.status]));
    expect(statusById.get(keeperId)).toBe("archived");
    expect(statusById.get(duplicateId)).toBe("archived");

    const { rows: changesetRows } = await client.query<{
      status: string;
      title: string;
    }>("SELECT status, title FROM changesets WHERE id = $1", [changesetId]);
    expect(changesetRows[0]).toMatchObject({
      status: "applied",
      title: "병합된 다이제스트",
    });
  });

  it("한 Digest가 여러 곳과 동시에 중복될 수 있다 — 먼저 처리된 병합이 나머지 대기 제안을 무효화한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
    const digestA1 = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "다이제스트 A1",
    });
    const digestA2 = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "다이제스트 A2",
    });
    const digestB = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "다이제스트 B",
    });
    const a1StatementId = await createFixtureStatement(spaceId, digestA1);
    const a2StatementId = await createFixtureStatement(spaceId, digestA2);
    const bStatementId = await createFixtureStatement(spaceId, digestB);

    // (A1,B)·(A2,B) 각각 별도 pending — B가 두 곳과 동시에 중복 감지된 경우.
    const changesetA1B = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "duplicates",
      fromId: a1StatementId,
      toId: bStatementId,
    });
    const changesetA2B = await createFixturePendingRelation({
      spaceId,
      sourceId,
      relationType: "duplicates",
      fromId: a2StatementId,
      toId: bStatementId,
    });

    const mergedDigest = {
      title: "A1과 B 병합",
      description: "병합 설명",
      body: { type: "decision" },
      topics: [],
      tags: [],
      reference_ids: [],
      new_reference_keys: [],
      external_urls: [],
    };

    // (A1,B) 먼저 확정 — B의 진술이 archive되면서 (A2,B)는 대상 소실로 무효화돼야 한다.
    await client.query(
      "SELECT resolve_duplicate_relation($1, $2::jsonb, '[]'::jsonb)",
      [changesetA1B, JSON.stringify(mergedDigest)],
    );

    const { rows } = await client.query<{
      status: string;
      invalidated_by_id: string | null;
    }>("SELECT status, invalidated_by_id FROM changesets WHERE id = $1", [
      changesetA2B,
    ]);

    expect(rows[0]?.status).toBe("rejected");
    expect(rows[0]?.invalidated_by_id).toBe(changesetA1B);
  });
});
