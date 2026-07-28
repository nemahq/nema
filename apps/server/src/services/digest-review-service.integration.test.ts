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

import { TAG_COLORS } from "@nema-io/shared";

// changeset-service.integration.test.ts와 같은 이유로 로컬 Postgres에 슈퍼유저로 직접 붙는다.
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
        "[digest-review-service.integration.test] local Postgres (127.0.0.1:54322) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run.",
      );
    }
    console.warn(
      "[digest-review-service.integration.test] local Postgres (127.0.0.1:54322) unreachable — skipping. Run `supabase start` first.",
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
    [workspaceId, "Space A", publicId],
  );
  return rows[0].id;
}

async function createFixtureSource(spaceId: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO sources (space_id, body, status, digestion_status) VALUES ($1, 'fixture body', 'pending', 'pending') RETURNING id",
    [spaceId],
  );
  return rows[0].id;
}

function fixtureDigest(overrides: Record<string, unknown> = {}) {
  return {
    title: "픽스처 다이제스트",
    description: "설명",
    body: { type: "learning", finding: "발견" },
    topics: [],
    tags: [],
    reference_ids: [],
    new_reference_keys: [],
    external_urls: [],
    ...overrides,
  };
}

async function createReview(args: {
  sourceId: string;
  digests: unknown[];
  newReferences?: unknown[];
}): Promise<string> {
  const { sourceId, digests, newReferences = [] } = args;
  const { rows } = await client.query<{ create_ingestion_review: string }>(
    "SELECT create_ingestion_review($1, $2::jsonb, $3::jsonb)",
    [sourceId, JSON.stringify(digests), JSON.stringify(newReferences)],
  );
  return rows[0].create_ingestion_review;
}

async function getChanges(
  changesetId: string,
  targetType: string,
): Promise<
  Array<{ target_id: string; position: number; data: Record<string, unknown> }>
> {
  const { rows } = await client.query(
    "SELECT target_id, position, data FROM changes WHERE changeset_id = $1 AND target_type = $2 AND action = 'create'",
    [changesetId, targetType],
  );
  return rows;
}

function requireChangeByTitle(
  changes: Array<{
    target_id: string;
    position: number;
    data: Record<string, unknown>;
  }>,
  title: string,
): { target_id: string; position: number; data: Record<string, unknown> } {
  const found = changes.find((row) => row.data.title === title);
  if (!found) {
    throw new Error(`no change row with data.title=${title}`);
  }
  return found;
}

describe("update_pending_ingestion RPC (integration)", () => {
  it("id는 저장을 거쳐도 유지되고, 페이로드에서 빠진 항목만 삭제된다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [fixtureDigest({ title: "d1" }), fixtureDigest({ title: "d2" })],
    });

    const before = await getChanges(changesetId, "digest");
    const d1 = requireChangeByTitle(before, "d1");
    const d2 = requireChangeByTitle(before, "d2");

    const { rows } = await client.query<{ update_pending_ingestion: number }>(
      "SELECT update_pending_ingestion($1, $2, $3::jsonb)",
      [
        changesetId,
        1,
        JSON.stringify([
          {
            ...fixtureDigest({ title: "d1-수정" }),
            id: d1.target_id,
            position: 1,
          },
        ]),
      ],
    );

    expect(rows[0].update_pending_ingestion).toBe(2);

    const after = await getChanges(changesetId, "digest");
    expect(after).toHaveLength(1);
    expect(after[0].target_id).toBe(d1.target_id);
    expect(after[0].position).toBe(1);
    expect(after[0].data.title).toBe("d1-수정");

    const d2Gone = await client.query(
      "SELECT 1 FROM changes WHERE changeset_id = $1 AND target_id = $2",
      [changesetId, d2.target_id],
    );
    expect(d2Gone.rowCount).toBe(0);
  });

  it("expectedVersion이 어긋나면 NM012로 거절되고 이전 저장 상태가 그대로 남는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [fixtureDigest({ title: "d1" })],
    });
    const [{ target_id: digestId }] = await getChanges(changesetId, "digest");

    await client.query("SELECT update_pending_ingestion($1, $2, $3::jsonb)", [
      changesetId,
      1,
      JSON.stringify([
        { ...fixtureDigest({ title: "첫 저장" }), id: digestId, position: 0 },
      ]),
    ]);

    await client.query("SAVEPOINT before_version_conflict");
    await expect(
      client.query("SELECT update_pending_ingestion($1, $2, $3::jsonb)", [
        changesetId,
        1,
        JSON.stringify([
          {
            ...fixtureDigest({ title: "두 번째 저장(거절돼야 함)" }),
            id: digestId,
            position: 0,
          },
        ]),
      ]),
    ).rejects.toMatchObject({ code: "NM012" });
    await client.query("ROLLBACK TO SAVEPOINT before_version_conflict");

    const [row] = await getChanges(changesetId, "digest");
    expect(row.data.title).toBe("첫 저장");
  });

  // ERRCODE 없이 두면 query_failed(500)로 떨어져, 이 함수가 정확히 대응하려는
  // 두 탭 동시 편집(다른 탭이 먼저 확정·버림)이 스퓨리어스 500/Sentry로 샌다.
  it("이미 버려진(open이 아닌) changeset에 저장하면 NM008로 거절된다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [fixtureDigest({ title: "d1" })],
    });
    const [{ target_id: digestId }] = await getChanges(changesetId, "digest");
    await client.query("SELECT discard_ingestion_review($1)", [changesetId]);

    await expect(
      client.query("SELECT update_pending_ingestion($1, $2, $3::jsonb)", [
        changesetId,
        1,
        JSON.stringify([
          { ...fixtureDigest({ title: "재수정" }), id: digestId, position: 0 },
        ]),
      ]),
    ).rejects.toMatchObject({ code: "NM008" });
  });

  it("존재하지 않는 changeset id로 저장하면 not_found(P0002)로 거절된다", async () => {
    if (!localDbAvailable) {
      return;
    }

    await expect(
      client.query("SELECT update_pending_ingestion($1, $2, $3::jsonb)", [
        randomUUID(),
        1,
        JSON.stringify([fixtureDigest({ title: "d1" })]),
      ]),
    ).rejects.toMatchObject({ code: "P0002" });
  });

  it("digest가 신규 Reference 인용을 끊고 저장하면 그 Reference create-change가 삭제된다(고아 방지)", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [fixtureDigest({ title: "d1", new_reference_keys: ["r1"] })],
      newReferences: [
        {
          key: "r1",
          type: "product",
          title: "신규 제품",
          body: "설명",
          external_urls: [],
        },
      ],
    });

    const [{ target_id: digestId }] = await getChanges(changesetId, "digest");
    const referencesBefore = await getChanges(changesetId, "reference");
    expect(referencesBefore).toHaveLength(1);

    await client.query(
      "SELECT update_pending_ingestion($1, $2, $3::jsonb, $4::jsonb)",
      [
        changesetId,
        1,
        JSON.stringify([
          { ...fixtureDigest({ title: "d1" }), id: digestId, position: 0 },
        ]),
        JSON.stringify([]),
      ],
    );

    const referencesAfter = await getChanges(changesetId, "reference");
    expect(referencesAfter).toHaveLength(0);
  });

  it("같은 changeset·target_id로 create 행이 중복되지 않는다(부분 유니크 인덱스)", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [fixtureDigest({ title: "d1" })],
    });
    const freshTargetId = randomUUID();

    await client.query(
      "INSERT INTO changes (changeset_id, action, target_type, target_id, data, position) VALUES ($1, 'create', 'digest', $2, '{}'::jsonb, 1)",
      [changesetId, freshTargetId],
    );

    await client.query("SAVEPOINT before_duplicate_insert");
    await expect(
      client.query(
        "INSERT INTO changes (changeset_id, action, target_type, target_id, data, position) VALUES ($1, 'create', 'digest', $2, '{}'::jsonb, 2)",
        [changesetId, freshTargetId],
      ),
    ).rejects.toThrow(/duplicate key value violates unique constraint/);
    await client.query("ROLLBACK TO SAVEPOINT before_duplicate_insert");
  });

  it("discard·restore를 거쳐도 draft_version이 유지된다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [fixtureDigest({ title: "d1" })],
    });

    await client.query("SELECT discard_ingestion_review($1)", [changesetId]);
    const afterDiscard = await client.query<{ draft_version: number }>(
      "SELECT draft_version FROM changesets WHERE id = $1",
      [changesetId],
    );
    expect(afterDiscard.rows[0].draft_version).toBe(1);

    await client.query("SELECT restore_ingestion_review($1)", [changesetId]);
    const afterRestore = await client.query<{ draft_version: number }>(
      "SELECT draft_version FROM changesets WHERE id = $1",
      [changesetId],
    );
    expect(afterRestore.rows[0].draft_version).toBe(1);
  });

  it("anon 롤은 update_pending_ingestion을 실행할 권한이 없다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const { rows } = await client.query<{ can_execute: boolean }>(
      `SELECT has_function_privilege(
         'anon',
         'update_pending_ingestion(uuid, integer, jsonb, jsonb, jsonb)',
         'EXECUTE'
       ) AS can_execute`,
    );
    expect(rows[0].can_execute).toBe(false);
  });
});

describe("Tag color 배정 (write_ingestion_review_changes/confirm_ingestion_review, integration)", () => {
  it("엔진이 제안한 신규 Tag draft에 8개 팔레트 중 하나의 color가 채워진다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);
    const changesetId = await createReview({
      sourceId,
      digests: [
        fixtureDigest({
          title: "d1",
          tags: [{ title: "신규 태그", description: "정의" }],
        }),
      ],
    });

    const changes = await getChanges(changesetId, "digest");
    const tags = requireChangeByTitle(changes, "d1").data.tags as Array<{
      id: string;
      color: string;
    }>;
    expect(tags).toHaveLength(1);
    expect(tags[0].id).toBeTruthy();
    expect(TAG_COLORS).toContain(tags[0].color);
  });

  // 정의(description)와 같은 원칙 — 재사용 판단·표시 기준인 color는 리뷰 확정
  // 한 번이 조용히 바꾸면 안 된다(20260728021441 마이그레이션 주석 참고).
  it("확정 시 신규 Tag는 draft가 보여준 color를 레지스트리에 이어받고, 기존 Tag의 color는 덮지 않는다", async () => {
    if (!localDbAvailable) {
      return;
    }

    const workspaceId = await createFixtureWorkspace();
    const spaceId = await createFixtureSpace(workspaceId);
    const sourceId = await createFixtureSource(spaceId);

    const { rows: existingTagRows } = await client.query<{ id: string }>(
      "INSERT INTO tags (workspace_id, title, description, color) VALUES ($1, $2, $3, 'violet') RETURNING id",
      [workspaceId, "기존 태그", "기존 정의"],
    );
    const existingTagId = existingTagRows[0].id;

    const changesetId = await createReview({
      sourceId,
      digests: [
        fixtureDigest({
          title: "d1",
          tags: [
            { title: "기존 태그", description: "기존 정의" },
            { title: "신규 태그", description: "새 정의" },
          ],
        }),
      ],
    });

    const draftTags = requireChangeByTitle(
      await getChanges(changesetId, "digest"),
      "d1",
    ).data.tags as Array<{ title: string; color: string }>;
    const draftNewTagColor = draftTags.find(
      (tag) => tag.title === "신규 태그",
    )?.color;

    await client.query("SELECT confirm_ingestion_review($1)", [changesetId]);

    const { rows: tagRows } = await client.query<{
      id: string;
      title: string;
      color: string;
    }>("SELECT id, title, color FROM tags WHERE workspace_id = $1", [
      workspaceId,
    ]);

    const existing = tagRows.find((row) => row.id === existingTagId);
    expect(existing?.color).toBe("violet");

    const created = tagRows.find((row) => row.title === "신규 태그");
    expect(created?.color).toBe(draftNewTagColor);
  });
});
