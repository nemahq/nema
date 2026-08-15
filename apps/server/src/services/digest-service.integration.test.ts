import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "@server/env";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";

// digest-service.test.ts(단위)는 supabase를 mock해 RLS를 못 잡는다 — deleteDigest는
// "가림이 실제로 남의 다이제스트엔 안 먹힌다"를 Postgres 정책 평가로만 확인할 수
// 있어 로컬 Supabase가 필요하다. source-service.integration.test.ts와 같은 이유.
process.env.APP_ENV ??= "local";
process.env.VOYAGE_API_KEY ??= "test-placeholder";
process.env.QDRANT_URL ??= "http://localhost:0";
process.env.QDRANT_API_KEY ??= "test-placeholder";
loadEnv(join(fileURLToPath(import.meta.url), "..", "..", ".."));

// 색인·벡터 삭제는 Voyage·Qdrant 실제 호출이 필요해 이 스위트의 몫이 아니다(그
// 자체는 digest-index-service 단위 테스트 몫) — 여기서는 "가릴 때 이 함수가
// 불렸는가"만 본다.
const { mockDeleteDigestVectors, mockIndexDigests } = vi.hoisted(() => ({
  mockDeleteDigestVectors: vi.fn().mockResolvedValue(undefined),
  mockIndexDigests: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@server/services/digest-index-service", () => ({
  deleteDigestVectors: mockDeleteDigestVectors,
  indexDigests: mockIndexDigests,
}));

import {
  deleteDigest,
  getDigest,
  restoreDigest,
} from "@server/services/digest-service";

const SETUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 20_000;

const LOCAL_URL = "http://127.0.0.1:54321";
// source-service.integration.test.ts와 같은 고정 데모 키 — 비밀이 아니다.
const LOCAL_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let localDbAvailable = false;

interface TestUser {
  id: string;
  supabase: TypedSupabaseClient;
}

async function createTestUser(): Promise<TestUser> {
  const email = `digest-delete-test-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw error ?? new Error("failed to create test user");
  }

  const anon = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInError } =
    await anon.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) {
    throw signInError ?? new Error("failed to sign in test user");
  }

  const supabase = createClient<Database>(LOCAL_URL, LOCAL_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
    },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { id: data.user.id, supabase };
}

// deleteDigest·getDigest는 LLM을 안 타므로 ingestSource 없이 admin 클라이언트로
// 원문·다이제스트를 바로 심는다(RLS 우회, 픽스처 전용).
async function seedDigest(ownerId: string): Promise<{
  sourceId: string;
  digestId: string;
  digestPublicId: string;
}> {
  const { data: source, error: sourceError } = await admin
    .from("sources")
    .insert({ user_id: ownerId, body: "가림 테스트 원문" })
    .select("id")
    .single();
  if (sourceError || !source) {
    throw sourceError ?? new Error("failed to seed source");
  }

  const { data: digest, error: digestError } = await admin
    .from("digests")
    .insert({
      source_id: source.id,
      type: "decision",
      title: "가림 테스트 결정",
      body: { choice: "fixture" },
      extraction_order: 0,
    })
    .select("id, public_id")
    .single();
  if (digestError || !digest) {
    throw digestError ?? new Error("failed to seed digest");
  }

  return {
    sourceId: source.id,
    digestId: digest.id,
    digestPublicId: digest.public_id,
  };
}

let userA: TestUser;
let userB: TestUser;

beforeAll(async () => {
  try {
    userA = await createTestUser();
    userB = await createTestUser();
    localDbAvailable = true;
  } catch (err) {
    if (process.env.REQUIRE_LOCAL_DB === "true") {
      throw new Error(
        `[digest-service.integration.test] local Supabase (${LOCAL_URL}) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.warn(
      `[digest-service.integration.test] local Supabase (${LOCAL_URL}) unreachable — skipping. Run 'supabase start' first.`,
    );
  }
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  if (!localDbAvailable) {
    return;
  }
  await admin.auth.admin.deleteUser(userA.id);
  await admin.auth.admin.deleteUser(userB.id);
});

afterEach(() => {
  mockDeleteDigestVectors.mockClear();
  mockIndexDigests.mockClear();
});

describe("deleteDigest (RLS)", () => {
  it(
    "가리기는 Postgres 행을 지우지 않고 trashed_at만 남긴다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);

      const result = await deleteDigest({
        supabase: userA.supabase,
        digestId,
      });
      expect(result.success).toBe(true);

      const { data: row } = await admin
        .from("digests")
        .select("id, trashed_at")
        .eq("id", digestId)
        .single();
      expect(row?.id).toBe(digestId);
      expect(row?.trashed_at).not.toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "한 다이제스트를 가려도 같은 원문의 다른 다이제스트는 멀쩡하다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { sourceId, digestId } = await seedDigest(userA.id);
      const { data: sibling, error: siblingError } = await admin
        .from("digests")
        .insert({
          source_id: sourceId,
          type: "learning",
          title: "가림 테스트 형제 다이제스트",
          body: { finding: "fixture" },
          extraction_order: 1,
        })
        .select("id")
        .single();
      if (siblingError || !sibling) {
        throw siblingError ?? new Error("failed to seed sibling digest");
      }

      await deleteDigest({ supabase: userA.supabase, digestId });

      const { data: visibleIds } = await admin
        .from("v_visible_digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(visibleIds?.map((row) => row.id)).toEqual([sibling.id]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "가리면 벡터도 함께 지운다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);

      await deleteDigest({ supabase: userA.supabase, digestId });

      expect(mockDeleteDigestVectors).toHaveBeenCalledWith([digestId]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 다이제스트는 가릴 수 없다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);

      const result = await deleteDigest({
        supabase: userB.supabase,
        digestId,
      });
      expect(result.success).toBe(false);

      const { data: row } = await admin
        .from("digests")
        .select("trashed_at")
        .eq("id", digestId)
        .single();
      expect(row?.trashed_at).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "이미 가려진 다이제스트를 다시 가려도 에러가 아니다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);

      const first = await deleteDigest({ supabase: userA.supabase, digestId });
      const second = await deleteDigest({
        supabase: userA.supabase,
        digestId,
      });

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "없는 digestId를 불러도 에러가 아니다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const result = await deleteDigest({
        supabase: userA.supabase,
        digestId: randomUUID(),
      });
      expect(result.success).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("restoreDigest (RLS)", () => {
  it(
    "가려진 다이제스트를 되살리면 다시 보이고 재색인한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);
      await deleteDigest({ supabase: userA.supabase, digestId });

      const result = await restoreDigest({
        supabase: userA.supabase,
        userId: userA.id,
        digestId,
      });
      expect(result.success).toBe(true);

      const { data: row } = await admin
        .from("digests")
        .select("trashed_at")
        .eq("id", digestId)
        .single();
      expect(row?.trashed_at).toBeNull();
      expect(mockIndexDigests).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userA.id,
          digests: [expect.objectContaining({ id: digestId })],
        }),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "가려지지 않은 다이제스트를 되살리려 하면 에러 없이 false다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);

      const result = await restoreDigest({
        supabase: userA.supabase,
        userId: userA.id,
        digestId,
      });
      expect(result.success).toBe(false);
      expect(mockIndexDigests).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 다이제스트는 되살릴 수 없다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);
      await deleteDigest({ supabase: userA.supabase, digestId });

      const result = await restoreDigest({
        supabase: userB.supabase,
        userId: userB.id,
        digestId,
      });
      expect(result.success).toBe(false);

      const { data: row } = await admin
        .from("digests")
        .select("trashed_at")
        .eq("id", digestId)
        .single();
      expect(row?.trashed_at).not.toBeNull();
    },
    TEST_TIMEOUT_MS,
  );
});

describe("getDigest (RLS)", () => {
  it(
    "소유자는 digestPublicId(주소가 싣는 값)로 조회할 수 있고, 남은 not-found로 걸린다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestPublicId } = await seedDigest(userA.id);

      const asOwner = await getDigest({
        supabase: userA.supabase,
        userId: userA.id,
        digestPublicId,
      });
      expect(asOwner.title).toBe("가림 테스트 결정");

      await expect(
        getDigest({
          supabase: userB.supabase,
          userId: userB.id,
          digestPublicId,
        }),
      ).rejects.toMatchObject({ code: "PGRST116" });
    },
    TEST_TIMEOUT_MS,
  );

  // get_digest MCP 도구(apps/mcp/src/server.ts)는 search_digests·get_relations가
  // 돌려준 내부 id를 그대로 이어 부른다 — DigestGetInputSchema 유니언의 이 갈래가
  // 회귀하면 CI가 못 잡고 MCP 클라이언트에서만 드러난다.
  it(
    "digestId(내부 id, MCP 경로)로도 조회할 수 있다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest(userA.id);

      const result = await getDigest({
        supabase: userA.supabase,
        userId: userA.id,
        digestId,
      });
      expect(result.id).toBe(digestId);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "가려진 다이제스트는 소유자가 다시 물어도 not-found다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId, digestPublicId } = await seedDigest(userA.id);
      await deleteDigest({ supabase: userA.supabase, digestId });

      await expect(
        getDigest({
          supabase: userA.supabase,
          userId: userA.id,
          digestPublicId,
        }),
      ).rejects.toMatchObject({ code: "PGRST116" });
    },
    TEST_TIMEOUT_MS,
  );
});
