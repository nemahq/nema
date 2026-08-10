import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import type { GeneratedDigest } from "@server/prompts/digest-generation";
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

let mockDigests: GeneratedDigest[] = [];
function mockGenerate(): Promise<{ digests: GeneratedDigest[] }> {
  return Promise.resolve({ digests: mockDigests });
}

function fixtureDigest(title: string): GeneratedDigest {
  return {
    type: "decision",
    title,
    situation: "fixture situation",
    choice: "fixture choice",
    reason: null,
    tradeoff: null,
    alternatives: null,
    question: null,
    background: null,
    branches: null,
    resolutionCondition: null,
    finding: null,
    evidence: null,
    concept: null,
    assumption: null,
    impact: null,
    verificationCondition: null,
  };
}

// 유저 생성·로그인 왕복이 있는 beforeAll은 개별 테스트보다 여유를 더 둔다.
const SETUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 20_000;

const LOCAL_URL = "http://127.0.0.1:54321";
// 모든 로컬 Supabase 스택이 공유하는 고정 데모 키(supabase/CLAUDE.md) — 비밀이 아니다.
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

describe("source-service (RLS)", () => {
  it(
    "넣은 원문의 다이제스트는 소유자만 볼 수 있다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockDigests = [fixtureDigest("A의 결정")];

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
      mockDigests = [fixtureDigest("A의 결정 2")];
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
      mockDigests = [fixtureDigest("첫 추출")];
      const { sourceId, digests: first } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "재추출 대상 원문",
      });

      mockDigests = [fixtureDigest("재추출된 결과")];
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
      mockDigests = [fixtureDigest("삭제될 결정")];
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
});
