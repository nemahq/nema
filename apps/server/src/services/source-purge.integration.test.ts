import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@server/infra/supabase/database.types";

// purge_expired_sources는 SECURITY DEFINER RPC라 service_role로만 부를 수 있고,
// FOR UPDATE SKIP LOCKED·CASCADE 전파는 Postgres가 실제로 평가해야만 드러난다 —
// mock supabase로는 확인할 수 없다. source-service.integration.test.ts와 같은 이유로
// 로컬 Supabase가 필요하다.
const SETUP_TIMEOUT_MS = 30_000;
const TEST_TIMEOUT_MS = 20_000;

const LOCAL_URL = "http://127.0.0.1:54321";
// source-service.integration.test.ts와 같은 고정 데모 키 — 비밀이 아니다.
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let localDbAvailable = false;
let ownerId: string;

beforeAll(async () => {
  try {
    const email = `source-purge-test-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error("failed to create test user");
    }
    ownerId = data.user.id;
    localDbAvailable = true;
  } catch (err) {
    if (process.env.REQUIRE_LOCAL_DB === "true") {
      throw new Error(
        `[source-purge.integration.test] local Supabase (${LOCAL_URL}) unreachable, but REQUIRE_LOCAL_DB=true. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.warn(
      `[source-purge.integration.test] local Supabase (${LOCAL_URL}) unreachable — skipping. Run 'supabase start' first.`,
    );
  }
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  if (!localDbAvailable) {
    return;
  }
  await admin.auth.admin.deleteUser(ownerId);
});

// 보관기간을 굳이 짧게 주는 대신 trashed_at 자체를 과거로 심는다 — 실제 배치가
// 기다리는 것도 "지금부터 N일"이 아니라 "trashed_at + N일 < now()"라 결과는 같다.
async function seedTrashedSource(args: {
  trashedDaysAgo: number;
}): Promise<{ sourceId: string; digestId: string }> {
  const trashedAt = new Date(
    Date.now() - args.trashedDaysAgo * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data: source, error: sourceError } = await admin
    .from("sources")
    .insert({ user_id: ownerId, body: "purge 테스트 원문" })
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
      title: "purge 테스트 결정",
      body: { choice: "fixture" },
      extraction_order: 0,
    })
    .select("id")
    .single();
  if (digestError || !digest) {
    throw digestError ?? new Error("failed to seed digest");
  }

  const { error: trashError } = await admin
    .from("sources")
    .update({ trashed_at: trashedAt })
    .eq("id", source.id);
  if (trashError) {
    throw trashError;
  }

  return { sourceId: source.id, digestId: digest.id };
}

describe("purge_expired_sources (RPC)", () => {
  it(
    "보관기간 지난 원문만 집어가고, 안 지난 원문은 남긴다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const expired = await seedTrashedSource({ trashedDaysAgo: 31 });
      const stillWithin = await seedTrashedSource({ trashedDaysAgo: 1 });

      const { data: purgedCount, error } = await admin.rpc(
        "purge_expired_sources",
        { p_retention_days: 30, p_batch_limit: 100 },
      );
      expect(error).toBeNull();
      expect(purgedCount).toBeGreaterThanOrEqual(1);

      const { data: expiredRow } = await admin
        .from("sources")
        .select("id")
        .eq("id", expired.sourceId)
        .maybeSingle();
      expect(expiredRow).toBeNull();

      const { data: withinRow } = await admin
        .from("sources")
        .select("id")
        .eq("id", stillWithin.sourceId)
        .maybeSingle();
      expect(withinRow?.id).toBe(stillWithin.sourceId);

      // 정리 — 다음 테스트가 이 원문을 다시 안 줍도록.
      await admin.from("sources").delete().eq("id", stillWithin.sourceId);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "원문이 사라지면 딸린 다이제스트·관계도 CASCADE로 함께 사라진다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const first = await seedTrashedSource({ trashedDaysAgo: 31 });
      const { data: secondDigest, error: secondDigestError } = await admin
        .from("digests")
        .insert({
          source_id: first.sourceId,
          type: "learning",
          title: "purge 테스트 학습",
          body: { finding: "fixture" },
          extraction_order: 1,
        })
        .select("id")
        .single();
      if (secondDigestError || !secondDigest) {
        throw secondDigestError ?? new Error("failed to seed second digest");
      }
      const { error: relationError } = await admin
        .from("digest_relations")
        .insert({
          from_digest_id: secondDigest.id,
          to_digest_id: first.digestId,
          type: "support",
        });
      expect(relationError).toBeNull();

      const { error } = await admin.rpc("purge_expired_sources", {
        p_retention_days: 30,
        p_batch_limit: 100,
      });
      expect(error).toBeNull();

      const { data: remainingDigests } = await admin
        .from("digests")
        .select("id")
        .in("id", [first.digestId, secondDigest.id]);
      expect(remainingDigests).toHaveLength(0);

      const { data: remainingRelations } = await admin
        .from("digest_relations")
        .select("id")
        .or(
          `from_digest_id.eq.${secondDigest.id},to_digest_id.eq.${first.digestId}`,
        );
      expect(remainingRelations).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "휴지통에 없는 원문은 안 건드린다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { data: source, error: sourceError } = await admin
        .from("sources")
        .insert({ user_id: ownerId, body: "살아있는 원문" })
        .select("id")
        .single();
      if (sourceError || !source) {
        throw sourceError ?? new Error("failed to seed source");
      }

      const { error } = await admin.rpc("purge_expired_sources", {
        p_retention_days: 30,
        p_batch_limit: 100,
      });
      expect(error).toBeNull();

      const { data: row } = await admin
        .from("sources")
        .select("id")
        .eq("id", source.id)
        .maybeSingle();
      expect(row?.id).toBe(source.id);

      await admin.from("sources").delete().eq("id", source.id);
    },
    TEST_TIMEOUT_MS,
  );
});
