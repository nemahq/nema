import { randomUUID } from "node:crypto";

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

import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import type { GeneratedDigests } from "@server/prompts/digest-generation";
import {
  deleteSource,
  ingestSource,
  reExtractSource,
} from "@server/services/source-service";

// RLS(owner-only)는 실제 소유자 판정을 Postgres 정책 평가에 맡기는데, 그건 실제
// 서로 다른 유저 JWT로 PostgREST를 거쳐야만 확인된다 — mock supabase로는 통과시킬 수
// 없다(모든 걸 다 허용해버리므로). 로컬 Supabase가 있어야 도는 이유.
vi.mock("@server/infra/llm/provider", () => ({
  getDigestGenerationProvider: () => ({ generateStructured: mockGenerate }),
}));

function noDigests(): GeneratedDigests {
  return {
    decisions: [],
    pendings: [],
    learnings: [],
    ideas: [],
    assumptions: [],
  };
}

let mockGenerated: GeneratedDigests = noDigests();
let mockError: Error | null = null;
function mockGenerate(): Promise<GeneratedDigests> {
  if (mockError) {
    return Promise.reject(mockError);
  }
  return Promise.resolve(mockGenerated);
}

function oneDecision(title: string): GeneratedDigests {
  return {
    ...noDigests(),
    decisions: [
      {
        title,
        choice: "fixture choice",
        situation: "fixture situation",
        reason: null,
        tradeoff: null,
        alternatives: null,
      },
    ],
  };
}

// 유저 생성·로그인 왕복이 있는 beforeAll은 개별 테스트보다 여유를 더 둔다.
const SETUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 20_000;

const LOCAL_URL = "http://127.0.0.1:54321";
// Supabase CLI가 기본 config.toml로 띄우는 모든 로컬 스택에 공통인 고정 데모 키
// (JWT_SECRET이 "super-secret-jwt-token-..."로 고정돼 있어 동일하다) — 비밀이 아니다.
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
  const email = `source-ingest-test-${randomUUID()}@example.com`;
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
        `[source-service.integration.test] local Supabase (${LOCAL_URL}) unreachable, but REQUIRE_LOCAL_DB=true — CI expected a live DB for this run. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.warn(
      `[source-service.integration.test] local Supabase (${LOCAL_URL}) unreachable — skipping. Run 'supabase start' first.`,
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
  mockError = null;
});

describe("source-service (RLS)", () => {
  it(
    "넣은 원문의 다이제스트는 소유자만 볼 수 있다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("A의 결정");

      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "A의 원문",
      });
      expect(digests).toHaveLength(1);
      expect(digests[0]?.title).toBe("A의 결정");

      const { data: asOwner } = await userA.supabase
        .from("sources")
        .select("id")
        .eq("id", sourceId)
        .maybeSingle();
      expect(asOwner?.id).toBe(sourceId);

      const { data: asOther } = await userB.supabase
        .from("sources")
        .select("id")
        .eq("id", sourceId)
        .maybeSingle();
      expect(asOther).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 원문을 재추출하면 not-found로 막힌다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("A의 결정 2");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "A의 원문 2",
      });

      await expect(
        reExtractSource({
          supabase: userB.supabase,
          sourceId,
        }),
      ).rejects.toMatchObject({ code: "PGRST116" });
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "재추출은 기존 다이제스트를 지우고 새 다이제스트로 바꾼다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("첫 추출");
      const { sourceId, digests: first } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "재추출 대상 원문",
      });

      mockGenerated = oneDecision("재추출된 결과");
      const { digests: second } = await reExtractSource({
        supabase: userA.supabase,
        sourceId,
      });

      expect(second).toHaveLength(1);
      expect(second[0]?.title).toBe("재추출된 결과");
      expect(second[0]?.id).not.toBe(first[0]?.id);

      const { data: remaining } = await userA.supabase
        .from("digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(remaining).toHaveLength(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "원문을 삭제하면 다이제스트도 함께 사라진다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("삭제될 결정");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "삭제될 원문",
      });

      const result = await deleteSource({
        supabase: userA.supabase,
        sourceId,
      });
      expect(result.success).toBe(true);

      const { data: remainingDigests } = await admin
        .from("digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(remainingDigests).toHaveLength(0);

      const repeat = await deleteSource({
        supabase: userA.supabase,
        sourceId,
      });
      expect(repeat.success).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 원문은 삭제되지 않는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("B가 못 지울 결정");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "B가 못 지울 원문",
      });

      const result = await deleteSource({
        supabase: userB.supabase,
        sourceId,
      });
      expect(result.success).toBe(false);

      const { data: stillThere } = await admin
        .from("sources")
        .select("id")
        .eq("id", sourceId)
        .maybeSingle();
      expect(stillThere?.id).toBe(sourceId);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "판단이 없는 원문은 다이제스트 0개로 completed된다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = noDigests();
      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "안녕하세요",
      });
      expect(digests).toHaveLength(0);

      const { data: source } = await userA.supabase
        .from("sources")
        .select("digestion_status")
        .eq("id", sourceId)
        .single();
      expect(source?.digestion_status).toBe("completed");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "넣기 중 LLM 호출이 실패해도 원문은 남는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const body = `넣기 실패 테스트 원문 ${randomUUID()}`;
      mockError = new Error("LLM unavailable");

      await expect(
        ingestSource({ supabase: userA.supabase, userId: userA.id, body }),
      ).rejects.toThrow("LLM unavailable");

      const { data: sources } = await userA.supabase
        .from("sources")
        .select("id, digestion_status")
        .eq("body", body);
      expect(sources).toHaveLength(1);
      expect(sources?.[0]?.digestion_status).toBe("pending");
    },
    TEST_TIMEOUT_MS,
  );

  // 이 테스트가 지키는 계약: 재추출은 delete보다 LLM 호출을 먼저 한다. 순서가
  // 반대면 이 테스트가 실패한다 — LLM이 실패할 때마다 기존 다이제스트가 사라지고
  // 다시 안 채워지는 상태가 영구화되기 때문이다.
  it(
    "재추출 중 LLM 호출이 실패해도 기존 다이제스트가 그대로 남는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("재추출 실패 테스트 - 기존");
      const { sourceId, digests: original } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "재추출 실패 테스트 원문",
      });
      expect(original).toHaveLength(1);

      mockError = new Error("LLM unavailable");
      await expect(
        reExtractSource({ supabase: userA.supabase, sourceId }),
      ).rejects.toThrow("LLM unavailable");

      const { data: remaining } = await userA.supabase
        .from("digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(remaining).toHaveLength(1);
      expect(remaining?.[0]?.id).toBe(original[0]?.id);
    },
    TEST_TIMEOUT_MS,
  );
});
