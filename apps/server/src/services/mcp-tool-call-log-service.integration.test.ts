import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "@server/env";
import type { Database } from "@server/infra/supabase/database.types";
import {
  logGetSource,
  logSearch,
} from "@server/services/mcp-tool-call-log-service";

process.env.APP_ENV ??= "local";
loadEnv(join(fileURLToPath(import.meta.url), "..", "..", ".."));

const SETUP_TIMEOUT_MS = 30_000;
const LOCAL_URL = "http://127.0.0.1:54321";
// source-service.integration.test.ts와 같은 고정 데모 키 — 비밀이 아니다.
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let localDbAvailable = false;
let userId: string;

// insertLog는 admin 클라이언트로 쓰기 때문에 RLS는 이미 우회한다 — 그래서 검증
// 대상은 "RLS가 막는가"가 아니라 "실제 스키마(특히 detail 형태를 강제하는 CHECK
// 제약)를 통과해 진짜로 행이 남는가"다. 단위 테스트는 supabase 클라이언트를
// mock해서 이 부분을 못 잡는다.
beforeAll(async () => {
  try {
    const email = `mcp-log-test-${randomUUID()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error || !data.user) {
      throw error ?? new Error("failed to create test user");
    }
    userId = data.user.id;
    localDbAvailable = true;
  } catch (err) {
    if (process.env.REQUIRE_LOCAL_DB === "true") {
      throw new Error(
        `[mcp-tool-call-log-service.integration.test] local Supabase (${LOCAL_URL}) unreachable, but REQUIRE_LOCAL_DB=true. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    console.warn(
      `[mcp-tool-call-log-service.integration.test] local Supabase (${LOCAL_URL}) unreachable — skipping. Run 'supabase start' first.`,
    );
  }
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  if (!localDbAvailable) {
    return;
  }
  await admin.auth.admin.deleteUser(userId);
});

describe("mcp-tool-call-log-service (schema round-trip)", () => {
  it("logSearch가 CHECK 제약을 통과해 실제로 행을 남긴다", async () => {
    if (!localDbAvailable) {
      return;
    }
    await logSearch({
      userId,
      detail: {
        query: "실제 DB 검증용 질의",
        results: [{ digestId: randomUUID(), score: 0.5 }],
      },
    });

    const { data } = await admin
      .from("mcp_tool_calls")
      .select("tool, detail")
      .eq("user_id", userId)
      .eq("tool", "search_digests")
      .single();
    expect(data?.detail).toMatchObject({ query: "실제 DB 검증용 질의" });
  });

  it("logGetSource가 CHECK 제약을 통과해 실제로 행을 남긴다", async () => {
    if (!localDbAvailable) {
      return;
    }
    const sourceId = randomUUID();
    await logGetSource({ userId, detail: { sourceId } });

    const { data } = await admin
      .from("mcp_tool_calls")
      .select("tool, detail")
      .eq("user_id", userId)
      .eq("tool", "get_source")
      .single();
    expect(data?.detail).toMatchObject({ sourceId });
  });
});
