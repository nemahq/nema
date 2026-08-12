import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { getDigest, listDigests } from "@server/services/digest-service";

// RLS(owner-only, sources 조인)는 실제 소유자 판정을 Postgres 정책 평가에 맡기는데,
// 그건 실제 서로 다른 유저 JWT로 PostgREST를 거쳐야만 확인된다 — mock supabase로는
// 통과시킬 수 없다(source-service.integration.test.ts와 같은 이유).
const SETUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 20_000;

const LOCAL_URL = "http://127.0.0.1:54321";
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
  const email = `digest-query-test-${randomUUID()}@example.com`;
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

async function seedDigest(args: {
  owner: TestUser;
  title: string;
}): Promise<{ sourceId: string; digestId: string }> {
  const { data: source, error: sourceError } = await args.owner.supabase
    .from("sources")
    .insert({ user_id: args.owner.id, body: `${args.title} 원문` })
    .select("id")
    .single();
  if (sourceError || !source) {
    throw sourceError ?? new Error("failed to seed source");
  }

  const { data: digest, error: digestError } = await args.owner.supabase
    .from("digests")
    .insert({
      source_id: source.id,
      type: "decision",
      title: args.title,
      body: { choice: `${args.title} 선택` },
    })
    .select("id")
    .single();
  if (digestError || !digest) {
    throw digestError ?? new Error("failed to seed digest");
  }

  return { sourceId: source.id, digestId: digest.id };
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

describe("digest-service (RLS)", () => {
  it(
    "list는 로그인한 유저의 다이제스트만, 최신순으로 돌려준다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const first = await seedDigest({ owner: userA, title: "A의 첫 결정" });
      const second = await seedDigest({ owner: userA, title: "A의 둘째 결정" });
      await seedDigest({ owner: userB, title: "B의 결정" });

      const result = await listDigests({ supabase: userA.supabase });

      const ids = result.map((entry) => entry.id);
      expect(ids).toContain(first.digestId);
      expect(ids).toContain(second.digestId);
      expect(ids.indexOf(second.digestId)).toBeLessThan(
        ids.indexOf(first.digestId),
      );
      expect(result.every((entry) => entry.title !== "B의 결정")).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "get은 sourceId·statement를 함께 실어보낸다(진술 없으면 null)",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { sourceId, digestId } = await seedDigest({
        owner: userA,
        title: "진술 없는 다이제스트",
      });

      const entry = await getDigest({
        supabase: userA.supabase,
        digestId,
      });

      expect(entry.sourceId).toBe(sourceId);
      expect(entry.statement).toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 다이제스트를 get하면 not-found로 막힌다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { digestId } = await seedDigest({
        owner: userA,
        title: "B가 못 보는 결정",
      });

      await expect(
        getDigest({ supabase: userB.supabase, digestId }),
      ).rejects.toMatchObject({ code: "PGRST116" });
    },
    TEST_TIMEOUT_MS,
  );
});
