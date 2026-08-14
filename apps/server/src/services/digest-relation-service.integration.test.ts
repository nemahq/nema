import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "@server/env";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { getDigestRelations } from "@server/services/digest-relation-service";

// 이 스위트는 Voyage·Qdrant를 안 타지만 loadEnv()는 스키마 전체를 검증한다 — CI엔
// 그 키들이 없어 더미로 채운다(로컬은 .env.secret의 실제 값이 먼저 있으면 그대로 쓰인다).
process.env.APP_ENV ??= "local";
process.env.VOYAGE_API_KEY ??= "test-placeholder";
process.env.QDRANT_URL ??= "http://localhost:0";
process.env.QDRANT_API_KEY ??= "test-placeholder";
loadEnv(join(fileURLToPath(import.meta.url), "..", "..", ".."));

// digest_relations의 RLS는 양 끝이 모두 내 것일 때만 열린다. 한쪽만 재는 정책으로
// 잘못 짜도 단위 테스트는 통과한다(mock supabase는 다 허용한다) — 실제 정책 평가를
// 거쳐야만 드러나는 자리라 여기서 본다. 관계가 다이제스트와 함께 사라지는지(CASCADE)도
// 같은 이유로 여기 있다.
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

interface TestUser {
  id: string;
  supabase: TypedSupabaseClient;
}

async function createTestUser(): Promise<TestUser> {
  const email = `digest-relation-test-${randomUUID()}@example.com`;
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

async function seedPair(user: TestUser): Promise<{
  decisionId: string;
  decisionPublicId: string;
  learningId: string;
  learningPublicId: string;
}> {
  const { data: source, error: sourceError } = await user.supabase
    .from("sources")
    .insert({ user_id: user.id, body: "관계 픽스처" })
    .select("id")
    .single();
  if (sourceError || !source) {
    throw sourceError ?? new Error("failed to insert source");
  }

  const { data: digests, error: digestError } = await user.supabase
    .from("digests")
    .insert([
      {
        source_id: source.id,
        type: "decision",
        title: "주 1회로 한다",
        body: { choice: "주 1회" },
        extraction_order: 0,
      },
      {
        source_id: source.id,
        type: "learning",
        title: "일 단위는 7배 비싸다",
        body: { finding: "호출이 7배" },
        extraction_order: 1,
      },
    ])
    .select("id, public_id, type");
  if (digestError || !digests) {
    throw digestError ?? new Error("failed to insert digests");
  }

  const decision = digests.find((row) => row.type === "decision");
  const learning = digests.find((row) => row.type === "learning");
  if (!decision || !learning) {
    throw new Error("fixture digests missing");
  }
  return {
    decisionId: decision.id,
    decisionPublicId: decision.public_id,
    learningId: learning.id,
    learningPublicId: learning.public_id,
  };
}

// seedPair는 둘 다 같은 원문 밑에 둔다 — 원문 하나만 휴지통에 넣는 시나리오는
// 상대 digest까지 같이 지워버려 검증이 안 된다. 그래서 원문을 따로 둔다.
async function seedDigestWithSource(
  user: TestUser,
  args: { type: "decision" | "learning"; title: string },
): Promise<{ sourceId: string; digestId: string }> {
  const { data: source, error: sourceError } = await user.supabase
    .from("sources")
    .insert({ user_id: user.id, body: `관계 픽스처 — ${args.title}` })
    .select("id")
    .single();
  if (sourceError || !source) {
    throw sourceError ?? new Error("failed to insert source");
  }

  const body =
    args.type === "decision" ? { choice: args.title } : { finding: args.title };
  const { data: digest, error: digestError } = await user.supabase
    .from("digests")
    .insert({
      source_id: source.id,
      type: args.type,
      title: args.title,
      body,
      extraction_order: 0,
    })
    .select("id")
    .single();
  if (digestError || !digest) {
    throw digestError ?? new Error("failed to insert digest");
  }

  return { sourceId: source.id, digestId: digest.id };
}

let userA: TestUser;
let userB: TestUser;
let localDbAvailable = false;

beforeAll(async () => {
  try {
    userA = await createTestUser();
    userB = await createTestUser();
    localDbAvailable = true;
  } catch (err) {
    if (process.env.REQUIRE_LOCAL_DB === "true") {
      throw new Error(
        `[digest-relation-service.integration.test] local Supabase (${LOCAL_URL}) unreachable, but REQUIRE_LOCAL_DB=true. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.warn(
      `[digest-relation-service.integration.test] local Supabase (${LOCAL_URL}) unreachable — skipping. Run 'supabase start' first.`,
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

describe("digest_relations (RLS)", () => {
  it(
    "관계는 양 끝에서 방향을 뒤집어 보이고, 남에게는 안 보인다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { decisionId, decisionPublicId, learningId, learningPublicId } =
        await seedPair(userA);
      const { error } = await userA.supabase.from("digest_relations").insert({
        from_digest_id: learningId,
        to_digest_id: decisionId,
        type: "support",
      });
      expect(error).toBeNull();

      const fromLearning = await getDigestRelations({
        supabase: userA.supabase,
        userId: userA.id,
        digestId: learningId,
      });
      expect(fromLearning).toEqual([
        {
          type: "supports",
          digestId: decisionId,
          publicId: decisionPublicId,
          title: "주 1회로 한다",
        },
      ]);

      const fromDecision = await getDigestRelations({
        supabase: userA.supabase,
        userId: userA.id,
        digestId: decisionId,
      });
      expect(fromDecision).toEqual([
        {
          type: "supported_by",
          digestId: learningId,
          publicId: learningPublicId,
          title: "일 단위는 7배 비싸다",
        },
      ]);

      await expect(
        getDigestRelations({
          supabase: userB.supabase,
          userId: userB.id,
          digestId: decisionId,
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "남의 다이제스트를 한쪽 끝에 매단 관계는 못 만든다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const mine = await seedPair(userB);
      const theirs = await seedPair(userA);

      const { error } = await userB.supabase.from("digest_relations").insert({
        from_digest_id: mine.learningId,
        to_digest_id: theirs.decisionId,
        type: "support",
      });

      expect(error).not.toBeNull();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다이제스트가 지워지면 거기 걸린 관계도 함께 사라진다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { decisionId, learningId } = await seedPair(userA);
      await userA.supabase.from("digest_relations").insert({
        from_digest_id: learningId,
        to_digest_id: decisionId,
        type: "support",
      });

      await userA.supabase.from("digests").delete().eq("id", learningId);

      const remaining = await getDigestRelations({
        supabase: userA.supabase,
        userId: userA.id,
        digestId: decisionId,
      });
      expect(remaining).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  // 관계 자신은 아무 상태도 안 가진다 — 끝점(다이제스트)의 가시성에서만 파생된다
  // (kickoff 3단 상속). digest_relations 행은 CASCADE 없이 그대로 남아있는 채로도
  // 관계가 양쪽 모두에서 안 보여야 한다.
  it(
    "관계 끝점 하나가 휴지통에 있으면 관계가 양쪽 모두에서 안 보인다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { decisionId, learningId } = await seedPair(userA);
      await userA.supabase.from("digest_relations").insert({
        from_digest_id: learningId,
        to_digest_id: decisionId,
        type: "support",
      });

      const { error: trashError } = await userA.supabase
        .from("digests")
        .update({ trashed_at: new Date().toISOString() })
        .eq("id", learningId);
      expect(trashError).toBeNull();

      // 지워진 쪽(learningId) 자체는 v_visible_digests 밖이라 not-found.
      await expect(
        getDigestRelations({
          supabase: userA.supabase,
          userId: userA.id,
          digestId: learningId,
        }),
      ).rejects.toThrow();

      // 살아있는 쪽(decisionId)에서 봐도 지워진 상대는 목록에서 빠진다.
      const fromDecision = await getDigestRelations({
        supabase: userA.supabase,
        userId: userA.id,
        digestId: decisionId,
      });
      expect(fromDecision).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );

  // 다이제스트 자신의 trashed_at은 안 건드리고 부모 원문만 휴지통에 넣어도(3단
  // 상속) 관계가 같은 방식으로 안 보여야 한다 — v_visible_digests가 조인으로
  // 파생하는 자리를 검증한다.
  it(
    "부모 원문이 휴지통에 있으면(다이제스트 자신은 안 건드려도) 관계가 안 보인다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      // 서로 다른 원문에 하나씩 둔다 — 같은 원문이면 원문 하나를 휴지통에 넣을 때
      // 상대(decision)까지 같이 안 보이게 돼 "다이제스트 자신은 안 건드려도"를
      // 못 잰다.
      const decision = await seedDigestWithSource(userA, {
        type: "decision",
        title: "주 1회로 한다",
      });
      const learning = await seedDigestWithSource(userA, {
        type: "learning",
        title: "일 단위는 7배 비싸다",
      });
      await userA.supabase.from("digest_relations").insert({
        from_digest_id: learning.digestId,
        to_digest_id: decision.digestId,
        type: "support",
      });

      const { data: trashed, error: trashError } = await userA.supabase.rpc(
        "trash_source",
        { p_source_id: learning.sourceId },
      );
      expect(trashError).toBeNull();
      expect(trashed).toBe(true);

      const { data: rawLearning } = await admin
        .from("digests")
        .select("trashed_at")
        .eq("id", learning.digestId)
        .single();
      expect(rawLearning?.trashed_at).toBeNull();

      const fromDecision = await getDigestRelations({
        supabase: userA.supabase,
        userId: userA.id,
        digestId: decision.digestId,
      });
      expect(fromDecision).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
