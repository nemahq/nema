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
    if (process.env.REQUIRE_LOCAL_DB === "true") {
      throw new Error(
        "[changeset-service.integration.test] local Postgres (127.0.0.1:54322) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run.",
      );
    }
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

// displayName을 주면 resolve_user_display_name()이 그 값을 그대로 골라내도록
// raw_user_meta_data.given_name에 심는다(author_name 스냅샷 테스트용) — 안 주면
// given_name/full_name/email 전부 없어 헬퍼가 user id로 폴백한다.
async function createFixtureUser(displayName?: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO auth.users (id, raw_user_meta_data) VALUES (gen_random_uuid(), $1::jsonb) RETURNING id",
    [displayName ? JSON.stringify({ given_name: displayName }) : "{}"],
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
    "INSERT INTO sources (space_id, author_id, author_name, body, title, status, digestion_status) VALUES ($1, $2, $3, $4, $5, 'pending', 'pending') RETURNING id",
    [
      args.spaceId,
      args.authorId,
      "픽스처 작성자",
      "fixture body",
      args.title ?? null,
    ],
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

async function createFixtureStatement(args: {
  spaceId: string;
  digestId: string;
  content?: string;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO statements (space_id, digest_id, content, type) VALUES ($1, $2, $3, 'question') RETURNING id",
    [args.spaceId, args.digestId, args.content ?? "fixture statement"],
  );
  return rows[0]?.id ?? "";
}

// apply_relation_changesets가 만드는 open relation changeset을 직접 재현한다 —
// resolve_conflict_relation/resolve_duplicate_relation은 이 모양(changeset + change
// row{type, from_id, to_id})만 전제로 하므로 엔진 배치 전체를 안 돌려도 된다.
async function createFixtureOpenRelation(args: {
  spaceId: string;
  sourceId: string;
  relationType: "conflicts" | "duplicates" | "supports";
  fromId: string;
  toId: string;
}): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO changesets (space_id, type, status, source_id) VALUES ($1, 'relation', 'open', $2) RETURNING id",
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

async function addFixtureWorkspaceMember(
  workspaceId: string,
  userId: string,
): Promise<void> {
  await client.query(
    "INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, 'owner')",
    [workspaceId, userId],
  );
}

async function addFixtureSpaceMember(
  spaceId: string,
  userId: string,
): Promise<void> {
  await client.query(
    "INSERT INTO space_members (space_id, user_id, role) VALUES ($1, $2, 'owner')",
    [spaceId, userId],
  );
}

async function createFixtureReference(
  workspaceId: string,
  title: string,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO \"references\" (workspace_id, type, title, body) VALUES ($1, 'term', $2, 'fixture body') RETURNING id",
    [workspaceId, title],
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

  // 다른 create_ingestion_review 테스트는 전부 topics: []/tags: []라 write_ingestion_review_changes의
  // id 부여 블록과 confirm_ingestion_review의 value->>'title' 읽기(20260727120000)를 어느 테스트도
  // 실행하지 않았다 — 회귀가 조용하다(#>> '{}'로 되돌아가면 "{\"id\":..,\"title\":..}"라는 이름의
  // Topic이 예외 없이 만들어진다).
  it("digest의 topics/tags 원소마다 uuid id가 붙고, confirm이 title로 레지스트리를 find-or-create한다", async () => {
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
      topics: ["주제 A"],
      tags: [{ title: "태그 A", description: "정의" }],
      reference_ids: [],
    };

    const { rows } = await client.query<{ create_ingestion_review: string }>(
      "SELECT create_ingestion_review($1, $2::jsonb)",
      [sourceId, JSON.stringify([digest])],
    );
    const changesetId = rows[0].create_ingestion_review;

    const { rows: changeRows } = await client.query<{
      data: { topics: { id: string; title: string }[]; tags: unknown[] };
    }>(
      "SELECT data FROM changes WHERE changeset_id = $1 AND target_type = 'digest' AND action = 'create'",
      [changesetId],
    );
    const storedTopics = changeRows[0]?.data.topics;
    expect(storedTopics).toHaveLength(1);
    expect(storedTopics?.[0]?.title).toBe("주제 A");
    expect(storedTopics?.[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(changeRows[0]?.data.tags).toEqual([
      expect.objectContaining({ title: "태그 A", description: "정의" }),
    ]);

    await client.query("SELECT confirm_ingestion_review($1)", [changesetId]);

    const { rows: topicRows } = await client.query<{ title: string }>(
      "SELECT title FROM topics WHERE space_id = $1 AND title = '주제 A'",
      [spaceId],
    );
    expect(topicRows).toHaveLength(1);

    const { rows: tagRows } = await client.query<{
      title: string;
      description: string;
    }>("SELECT title, description FROM tags WHERE workspace_id = $1", [
      workspaceId,
    ]);
    expect(tagRows).toEqual([{ title: "태그 A", description: "정의" }]);
  });
});

describe("discard_ingestion_review / restore_ingestion_review RPC — 상태 가드 (integration)", () => {
  it("open → discard(closed+discarded) → restore(open+outcome null) 왕복", async () => {
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

    await client.query("SELECT discard_ingestion_review($1)", [changesetId]);
    const afterDiscard = await client.query<{
      status: string;
      outcome: string | null;
    }>("SELECT status, outcome FROM changesets WHERE id = $1", [changesetId]);
    expect(afterDiscard.rows[0]).toEqual({
      status: "closed",
      outcome: "discarded",
    });

    await client.query("SELECT restore_ingestion_review($1)", [changesetId]);
    const afterRestore = await client.query<{
      status: string;
      outcome: string | null;
    }>("SELECT status, outcome FROM changesets WHERE id = $1", [changesetId]);
    expect(afterRestore.rows[0]).toEqual({ status: "open", outcome: null });
  });

  it("아직 open인 changeset은 restore할 수 없다(outcome이 discarded가 아님)", async () => {
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

    await expect(
      client.query("SELECT restore_ingestion_review($1)", [changesetId]),
    ).rejects.toThrow(/not a discarded ingestion review/);
  });

  it("확정(closed+applied)된 changeset은 restore할 수 없다 — Digest 재생성 방지", async () => {
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

    // 확정 = open→closed+applied 전이(review 확정과 동등한 최소 재현, 위 title 테스트와 같은 패턴).
    await client.query(
      "UPDATE changesets SET status = 'closed', outcome = 'applied' WHERE id = $1",
      [changesetId],
    );

    await expect(
      client.query("SELECT restore_ingestion_review($1)", [changesetId]),
    ).rejects.toThrow(/not a discarded ingestion review/);
  });
});

describe("author_name 스냅샷 (integration)", () => {
  // createFixtureSource는 raw INSERT라 author_name 컬럼을 안 채운다 — 이 테스트는
  // 일부러 그 픽스처를 안 쓰고 create_source RPC를 직접 거쳐 실제 스냅샷 계산까지
  // 태운다. 그래야 confirm_ingestion_review의 승계 로직이 통째로 사라져도
  // NULL=NULL로 조용히 통과하는 일이 없다.
  it("confirm_ingestion_review는 Digest에 Source의 author_name 스냅샷을 그대로 승계한다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser("카일");
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    await addFixtureSpaceMember(spaceId, userId);

    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);

    const { rows: sourceRows } = await client.query<{
      create_source: string;
    }>("SELECT create_source($1, $2)", [spaceId, "fixture body"]);
    const sourceId = sourceRows[0].create_source;

    const { rows: sourceAuthorRows } = await client.query<{
      author_name: string | null;
    }>("SELECT author_name FROM sources WHERE id = $1", [sourceId]);
    expect(sourceAuthorRows[0]?.author_name).toBe("카일");

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

    const { rows: digestRows } = await client.query<{
      author_id: string | null;
      author_name: string | null;
    }>("SELECT author_id, author_name FROM digests WHERE source_id = $1", [
      sourceId,
    ]);

    expect(digestRows[0]?.author_id).toBe(userId);
    expect(digestRows[0]?.author_name).toBe("카일");
  });

  it("archive_statement가 만드는 manual changeset은 author_id·author_name을 함께 채운다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser("우진");
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    await addFixtureSpaceMember(spaceId, userId);
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
    const digestId = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "픽스처 다이제스트",
    });
    const statementId = await createFixtureStatement({ spaceId, digestId });

    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);

    await client.query("SELECT archive_statement($1)", [statementId]);

    const { rows: changesetRows } = await client.query<{
      author_id: string | null;
      author_name: string | null;
    }>(
      `SELECT c.author_id, c.author_name FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE ch.target_type = 'statement' AND ch.target_id = $1 AND ch.action = 'archive'`,
      [statementId],
    );

    expect(changesetRows[0]?.author_id).toBe(userId);
    expect(changesetRows[0]?.author_name).toBe("우진");
  });
});

describe("sources.title 전파 트리거 (integration)", () => {
  it("open 상태인 ingestion changeset의 title은 Source 제목 변경을 따라간다", async () => {
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

  it("리뷰가 이미 닫힌(open이 아닌) ingestion changeset의 title은 소급 갱신하지 않는다", async () => {
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

    // open → closed+applied로 닫는다(review 확정과 동등한 최소 재현 — 상태만 직접 전이)
    await client.query(
      "UPDATE changesets SET status = 'closed', outcome = 'applied' WHERE id = $1",
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

describe("apply_relation_changesets RPC — open 제안 title (integration)", () => {
  it("끝점 두 Statement의 content를 'A vs B'로 합쳐 채운다(Digest 제목이 아니다)", async () => {
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

    // Digest 제목을 Statement content와 다르게 둬서, title이 digests.title이
    // 아니라 statements.content에서 나온다는 걸 구분해서 검증한다.
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
    const fromStatementId = await createFixtureStatement({
      spaceId,
      digestId: digestA,
      content: "진술 A 내용",
    });
    const toStatementId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
      content: "진술 B 내용",
    });

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
       WHERE c.type = 'relation' AND c.status = 'open'
         AND ch.data->>'from_id' = $1 AND ch.data->>'to_id' = $2`,
      [fromStatementId, toStatementId],
    );

    expect(rows[0]?.title).toBe("진술 A 내용 vs 진술 B 내용");
  });
});

describe("apply_relation_changesets RPC — 재제안 가드 (integration)", () => {
  it("사람이 실제로 거절한(invalidated_by_id 없는) discarded 쌍은 재제안을 계속 막는다", async () => {
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
    const fromId = await createFixtureStatement({ spaceId, digestId: digestA });
    const toId = await createFixtureStatement({ spaceId, digestId: digestB });

    const firstChangeset = await createFixtureOpenRelation({
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

  it("캐스케이드로 무효화된(invalidated_by_id 있는) discarded 쌍은 재제안을 막지 않는다", async () => {
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
    const fromId = await createFixtureStatement({ spaceId, digestId: digestA });
    const toId = await createFixtureStatement({ spaceId, digestId: digestB });

    const firstChangeset = await createFixtureOpenRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId,
      toId,
    });
    const otherChangesetId = await createFixtureOpenRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId,
      toId,
    });
    // 실제 캐스케이드(resolve_conflict_relation 등)를 다시 거치지 않고, 그 결과
    // 상태만 재현한다 — 이 테스트의 대상은 가드 조건이지 캐스케이드 발생 경로가 아니다.
    await client.query(
      "UPDATE changesets SET status = 'closed', outcome = 'discarded', invalidated_by_id = $2 WHERE id = $1",
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

    const { rows } = await client.query<{
      status: string;
      outcome: string | null;
    }>(
      `SELECT c.status, c.outcome FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE c.type = 'relation' AND ch.data->>'from_id' = $1 AND ch.data->>'to_id' = $2
       ORDER BY c.created_at DESC`,
      [fromId, toId],
    );
    // 무효화된 첫 changeset(closed+discarded) + 방금 새로 만들어진 open — 총 2건이어야 한다.
    expect(rows.map((r) => `${r.status}/${r.outcome ?? "-"}`).sort()).toEqual([
      "closed/discarded",
      "open/-",
    ]);
  });

  it.each(["conflicts", "duplicates"] as const)(
    "사람이 거절한 %s 쌍은 방향이 뒤집힌(B→A) 재제안도 계속 막는다",
    async (relationType) => {
      if (!localDbAvailable) {
        return;
      }

      const userId = await createFixtureUser();
      const workspaceId = await createFixtureWorkspace();
      const spaceId = await createFixtureSpace(workspaceId, "Space A");
      const sourceId = await createFixtureSource({
        spaceId,
        authorId: userId,
      });
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
      const fromId = await createFixtureStatement({
        spaceId,
        digestId: digestA,
      });
      const toId = await createFixtureStatement({ spaceId, digestId: digestB });

      const firstChangeset = await createFixtureOpenRelation({
        spaceId,
        sourceId,
        relationType,
        fromId,
        toId,
      });
      await client.query("SELECT reject_pending_relation($1)", [
        firstChangeset,
      ]);

      await client.query(
        "UPDATE sources SET linking_status = 'pending' WHERE id = $1",
        [sourceId],
      );
      // B→A로 방향만 뒤집어 재제안한다.
      const pending = [{ type: relationType, from_id: toId, to_id: fromId }];
      await client.query(
        "SELECT apply_relation_changesets($1, '[]'::jsonb, $2::jsonb)",
        [sourceId, JSON.stringify(pending)],
      );

      const { rows } = await client.query<{
        status: string;
        outcome: string | null;
      }>(
        `SELECT c.status, c.outcome FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE c.type = 'relation' AND ch.data->>'type' = $1
         AND ((ch.data->>'from_id' = $2 AND ch.data->>'to_id' = $3)
           OR (ch.data->>'from_id' = $3 AND ch.data->>'to_id' = $2))
       ORDER BY c.created_at DESC`,
        [relationType, fromId, toId],
      );
      // 거절된 첫 changeset(closed+discarded) 하나뿐이어야 한다 — 방향 뒤집혀도
      // 새 open이 안 생김. count만 세면 "지우고 새로 만듦"도 통과해버리므로
      // status/outcome까지 확인한다.
      expect(rows.map((r) => `${r.status}/${r.outcome ?? "-"}`)).toEqual([
        "closed/discarded",
      ]);
    },
  );

  it("거절한 supports 쌍은 방향이 뒤집히면 다시 제안된다 — 방향 의미가 있는 타입은 collapse하지 않는다", async () => {
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
    const fromId = await createFixtureStatement({ spaceId, digestId: digestA });
    const toId = await createFixtureStatement({ spaceId, digestId: digestB });

    const firstChangeset = await createFixtureOpenRelation({
      spaceId,
      sourceId,
      relationType: "supports",
      fromId,
      toId,
    });
    await client.query("SELECT reject_pending_relation($1)", [firstChangeset]);

    await client.query(
      "UPDATE sources SET linking_status = 'pending' WHERE id = $1",
      [sourceId],
    );
    const pending = [{ type: "supports", from_id: toId, to_id: fromId }];
    await client.query(
      "SELECT apply_relation_changesets($1, '[]'::jsonb, $2::jsonb)",
      [sourceId, JSON.stringify(pending)],
    );

    const { rows } = await client.query<{
      status: string;
      outcome: string | null;
    }>(
      `SELECT c.status, c.outcome FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE c.type = 'relation' AND ch.data->>'type' = 'supports'
         AND ((ch.data->>'from_id' = $1 AND ch.data->>'to_id' = $2)
           OR (ch.data->>'from_id' = $2 AND ch.data->>'to_id' = $1))
       ORDER BY c.created_at DESC`,
      [fromId, toId],
    );
    // 방향 의미가 있는 타입은 가드가 collapse하지 않으므로, 거절된 A→B와
    // 별개로 B→A open이 새로 생겨야 한다(conflicts·duplicates와 대조).
    expect(rows.map((r) => `${r.status}/${r.outcome ?? "-"}`).sort()).toEqual([
      "closed/discarded",
      "open/-",
    ]);
  });
});

describe("confirm_digest_edit RPC — manual changeset title (integration)", () => {
  it("Digest 수정으로 생기는 manual changeset의 title은 항상 null이다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
    // 확정본 수정 대상이라 원문이 active여야 한다(RPC 가드).
    await client.query("UPDATE sources SET status = 'active' WHERE id = $1", [
      sourceId,
    ]);
    const digestId = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "원본 제목",
    });

    const editedDigest = {
      title: "수정된 제목",
      description: "수정된 설명",
      body: { type: "decision", choice: "바뀐 선택" },
      topics: [],
      tags: [],
      reference_ids: [],
      new_reference_keys: [],
      external_urls: [],
    };

    await client.query(
      "SELECT confirm_digest_edit($1, $2::jsonb, '[]'::jsonb)",
      [digestId, JSON.stringify(editedDigest)],
    );

    const { rows } = await client.query<{ title: string | null }>(
      `SELECT c.title FROM changesets c
       JOIN changes ch ON ch.changeset_id = c.id
       WHERE ch.target_type = 'digest' AND ch.target_id = $1 AND ch.action = 'archive'`,
      [digestId],
    );

    expect(rows[0]?.title).toBeNull();
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
    const winnerId = await createFixtureStatement({
      spaceId,
      digestId: digestA,
    });
    const loserId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
    });
    const changesetId = await createFixtureOpenRelation({
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

    const { rows: changesetRows } = await client.query<{
      status: string;
      outcome: string | null;
    }>("SELECT status, outcome FROM changesets WHERE id = $1", [changesetId]);
    expect(changesetRows[0]?.status).toBe("closed");
    expect(changesetRows[0]?.outcome).toBe("applied");
  });

  it("판정 완료 후에도 원래 conflicts 제안 change row는 그대로 남는다(changeset-detail-service가 닫힌 뒤에도 읽음)", async () => {
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
    const winnerId = await createFixtureStatement({
      spaceId,
      digestId: digestA,
    });
    const loserId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
    });
    const changesetId = await createFixtureOpenRelation({
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
    const winnerId = await createFixtureStatement({
      spaceId,
      digestId: digestA,
    });
    const loserId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
    });
    const otherId = await createFixtureStatement({
      spaceId,
      digestId: digestC,
    });

    const conflictChangeset = await createFixtureOpenRelation({
      spaceId,
      sourceId,
      relationType: "conflicts",
      fromId: winnerId,
      toId: loserId,
    });
    // 패자(loserId)가 또 다른 진술(otherId)과도 별도 중복 제안으로 대기 중인 상태.
    const otherChangeset = await createFixtureOpenRelation({
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
      outcome: string | null;
      invalidated_by_id: string | null;
    }>(
      "SELECT status, outcome, invalidated_by_id FROM changesets WHERE id = $1",
      [otherChangeset],
    );

    expect(rows[0]?.status).toBe("closed");
    expect(rows[0]?.outcome).toBe("discarded");
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
    const winnerId = await createFixtureStatement({
      spaceId,
      digestId: digestA,
    });
    const loserId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
    });

    const firstChangeset = await createFixtureOpenRelation({
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
    const secondChangeset = await createFixtureOpenRelation({
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
    const keeperId = await createFixtureStatement({
      spaceId,
      digestId: digestA,
    });
    const duplicateId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
    });
    const changesetId = await createFixtureOpenRelation({
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
      outcome: string | null;
      title: string;
    }>("SELECT status, outcome, title FROM changesets WHERE id = $1", [
      changesetId,
    ]);
    expect(changesetRows[0]).toMatchObject({
      status: "closed",
      outcome: "applied",
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
    const a1StatementId = await createFixtureStatement({
      spaceId,
      digestId: digestA1,
    });
    const a2StatementId = await createFixtureStatement({
      spaceId,
      digestId: digestA2,
    });
    const bStatementId = await createFixtureStatement({
      spaceId,
      digestId: digestB,
    });

    // (A1,B)·(A2,B) 각각 별도 pending — B가 두 곳과 동시에 중복 감지된 경우.
    const changesetA1B = await createFixtureOpenRelation({
      spaceId,
      sourceId,
      relationType: "duplicates",
      fromId: a1StatementId,
      toId: bStatementId,
    });
    const changesetA2B = await createFixtureOpenRelation({
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
      outcome: string | null;
      invalidated_by_id: string | null;
    }>(
      "SELECT status, outcome, invalidated_by_id FROM changesets WHERE id = $1",
      [changesetA2B],
    );

    expect(rows[0]?.status).toBe("closed");
    expect(rows[0]?.outcome).toBe("discarded");
    expect(rows[0]?.invalidated_by_id).toBe(changesetA1B);
  });
});

describe("revert_changeset RPC — Reference manual changeset 멤버십 (integration)", () => {
  // 위의 다른 테스트들은 전부 슈퍼유저로 직접 쿼리해 auth.uid()가 NULL인 채로
  // 돈다 — is_space_member(NULL)이 항상 false라는 실제 로그인 유저의 실패
  // 경로를 이 방식으로는 절대 못 잡는다. request.jwt.claim.sub을 트랜잭션
  // 스코프로 세팅해 진짜 로그인 유저를 흉내 낸다.
  it("실제 로그인 유저가 Reference manual changeset(space_id NULL)을 되돌릴 수 있다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    await addFixtureWorkspaceMember(workspaceId, userId);
    const referenceId = await createFixtureReference(
      workspaceId,
      "픽스처 레퍼런스",
    );

    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);

    const { rows: archiveRows } = await client.query<{
      archive_reference: string;
    }>("SELECT archive_reference($1)", [referenceId]);
    const changesetId = archiveRows[0].archive_reference;

    const { rows: archivedStatus } = await client.query<{ status: string }>(
      'SELECT status FROM "references" WHERE id = $1',
      [referenceId],
    );
    expect(archivedStatus[0]?.status).toBe("archived");

    // 고치기 전엔 여기서 "changeset % not found or not accessible"로 실패했다
    // (space_id가 NULL이라 is_space_member(NULL)이 항상 false였으므로).
    const { rows: revertRows } = await client.query<{
      revert_changeset: string;
    }>("SELECT revert_changeset($1)", [changesetId]);
    expect(revertRows[0]?.revert_changeset).toBeTruthy();

    const { rows: restoredStatus } = await client.query<{ status: string }>(
      'SELECT status FROM "references" WHERE id = $1',
      [referenceId],
    );
    expect(restoredStatus[0]?.status).toBe("active");
  });
});

describe("restore_digest RPC — 되살리기 대상 changeset 범위 (integration)", () => {
  it("중복 병합(relation changeset)으로 archive된 Digest는 되살리지 못한다 — 병합 전체를 되돌리면 안 됨", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    await addFixtureWorkspaceMember(workspaceId, userId);
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    await addFixtureSpaceMember(spaceId, userId);
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });

    const digestA = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "Digest A",
    });
    const digestB = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "Digest B",
    });
    const digestC = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "Merged C",
    });

    // resolve_duplicate_relation이 만드는 모양을 직접 재현한다 — 하나의 relation
    // changeset 안에 create/digest(C) + archive/digest(A) + archive/digest(B).
    const { rows: mergeRows } = await client.query<{ id: string }>(
      "INSERT INTO changesets (space_id, type, status, outcome, source_id) VALUES ($1, 'relation', 'closed', 'applied', $2) RETURNING id",
      [spaceId, sourceId],
    );
    const mergeChangesetId = mergeRows[0].id;
    await client.query(
      "INSERT INTO changes (changeset_id, action, target_type, target_id, data) VALUES ($1, 'create', 'digest', $2, '{}'::jsonb)",
      [mergeChangesetId, digestC],
    );
    await client.query(
      "UPDATE digests SET status = 'archived' WHERE id IN ($1, $2)",
      [digestA, digestB],
    );
    await client.query(
      "INSERT INTO changes (changeset_id, action, target_type, target_id) VALUES ($1, 'archive', 'digest', $2)",
      [mergeChangesetId, digestA],
    );
    await client.query(
      "INSERT INTO changes (changeset_id, action, target_type, target_id) VALUES ($1, 'archive', 'digest', $2)",
      [mergeChangesetId, digestB],
    );

    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);

    // 고치기 전엔 여기서 restore_digest(A)가 relation changeset을 통째로
    // revert_changeset에 넘겨, C가 archive되고 A·B가 둘 다 부활했다. 실패한
    // 문(statement) 하나 때문에 트랜잭션 전체가 abort되지 않도록 SAVEPOINT로 감싼다.
    await client.query("SAVEPOINT before_restore_attempt");
    await expect(
      client.query("SELECT restore_digest($1)", [digestA]),
    ).rejects.toThrow(/no archiving changeset to revert/);
    await client.query("ROLLBACK TO SAVEPOINT before_restore_attempt");

    const { rows: statuses } = await client.query<{
      title: string;
      status: string;
    }>("SELECT title, status FROM digests WHERE id IN ($1, $2, $3)", [
      digestA,
      digestB,
      digestC,
    ]);
    const statusByTitle = new Map(statuses.map((r) => [r.title, r.status]));
    expect(statusByTitle.get("Digest A")).toBe("archived");
    expect(statusByTitle.get("Digest B")).toBe("archived");
    expect(statusByTitle.get("Merged C")).toBe("active");
  });
});

describe("restore_digest RPC — 원문 재추출 트리거 (integration)", () => {
  it("추출 완료 전에 archive된 Digest를 되살리면 원문의 extraction_status·linking_status를 함께 pending으로 되돌린다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const userId = await createFixtureUser();
    const workspaceId = await createFixtureWorkspace();
    await addFixtureWorkspaceMember(workspaceId, userId);
    const spaceId = await createFixtureSpace(workspaceId, "Space A");
    await addFixtureSpaceMember(spaceId, userId);
    const sourceId = await createFixtureSource({ spaceId, authorId: userId });
    const digestId = await createFixtureDigest({
      sourceId,
      spaceId,
      title: "Digest still extracting",
    });
    await client.query(
      "UPDATE digests SET extraction_status = 'pending' WHERE id = $1",
      [digestId],
    );

    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);

    await client.query("SELECT archive_digest($1)", [digestId]);

    // 이 Digest 없이 원문의 추출 배치가 완료된 상황을 재현한다(워커가 archived를 걸러냄).
    await client.query(
      "UPDATE sources SET extraction_status = 'completed', linking_status = 'completed' WHERE id = $1",
      [sourceId],
    );

    await client.query("SELECT restore_digest($1)", [digestId]);

    const { rows } = await client.query<{
      extraction_status: string;
      linking_status: string;
    }>("SELECT extraction_status, linking_status FROM sources WHERE id = $1", [
      sourceId,
    ]);
    expect(rows[0]?.extraction_status).toBe("pending");
    expect(rows[0]?.linking_status).toBe("pending");
  });
});
