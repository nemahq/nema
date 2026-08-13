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
import type { GeneratedDigests } from "@server/prompts/digest-generation";
import {
  deleteSource,
  getSource,
  ingestSource,
  reExtractSource,
} from "@server/services/source-service";

// getSource가 내부에서 getSupabaseAdmin()(→getEnv())을 타는 로그 경로를 갖게 되면서,
// 이 스위트도 서버 부트스트랩(index.ts)과 같은 초기화가 필요해졌다 — 안 하면
// getEnv()가 던지고, mcp-tool-call-log-service가 그 실패를 삼켜 조용히 로그만
// 안 남는 채로 테스트는 통과해버린다.
// loadEnv()는 스키마 전체(임베딩·벡터 키 포함)를 검증하는데, 이 스위트는
// digest-index-service를 통째로 mock해 Voyage·Qdrant를 실제로 안 타므로 그 값은
// 채워지기만 하면 된다 — CI에는 이 키들이 없어 더미로 대신한다(로컬은 실제 값이
// .env.secret에서 먼저 로드되므로 ??=가 덮어쓰지 않는다).
process.env.APP_ENV ??= "local";
process.env.VOYAGE_API_KEY ??= "test-placeholder";
process.env.QDRANT_URL ??= "http://localhost:0";
process.env.QDRANT_API_KEY ??= "test-placeholder";
loadEnv(join(fileURLToPath(import.meta.url), "..", "..", ".."));

// RLS(owner-only)는 실제 소유자 판정을 Postgres 정책 평가에 맡기는데, 그건 실제
// 서로 다른 유저 JWT로 PostgREST를 거쳐야만 확인된다 — mock supabase로는 통과시킬 수
// 없다(모든 걸 다 허용해버리므로). 로컬 Supabase가 있어야 도는 이유.
vi.mock("@server/infra/llm/provider", () => ({
  getDigestGenerationProvider: () => ({ generateStructured: mockGenerate }),
}));

// 색인은 Voyage·Qdrant 실제 호출이 필요해 이 스위트의 몫이 아니다(색인 자체·삭제는
// digest-index-service의 단위 테스트 몫). 이 스위트는 그 호출이 언제·무엇으로
// 나가는지(RLS·롤백·정리 트리거)만 본다. vi.mock은 파일 최상단으로 호이스트되므로
// 참조하는 mock은 vi.hoisted로 같이 끌어올려야 한다(그냥 const는 TDZ에 걸림).
const { mockIndexDigests, mockDeleteDigestVectors } = vi.hoisted(() => ({
  mockIndexDigests: vi.fn().mockResolvedValue(undefined),
  mockDeleteDigestVectors: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@server/services/digest-index-service", () => ({
  indexDigests: mockIndexDigests,
  deleteDigestVectors: mockDeleteDigestVectors,
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
let mockGenerateCallCount = 0;
let mockGenerateLastSystemPrompt: string | undefined;
function mockGenerate(args: {
  systemPrompt: string;
}): Promise<GeneratedDigests> {
  mockGenerateCallCount += 1;
  mockGenerateLastSystemPrompt = args.systemPrompt;
  if (mockError) {
    return Promise.reject(mockError);
  }
  return Promise.resolve(mockGenerated);
}

function oneDecision(
  title: string,
  choice = "fixture choice",
): GeneratedDigests {
  return {
    ...noDigests(),
    decisions: [
      {
        title,
        choice,
        situation: "fixture situation",
        reason: null,
        tradeoff: null,
        alternatives: null,
      },
    ],
  };
}

function twoDecisions(titles: [string, string]): GeneratedDigests {
  return {
    ...noDigests(),
    decisions: titles.map((title) => ({
      title,
      choice: `${title}의 선택`,
      situation: null,
      reason: null,
      tradeoff: null,
      alternatives: null,
    })),
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
// content_language 플로우 전용 — userA/userB의 profiles 행 유무는 다른 테스트가
// 전제로 깔고 있어(userA=행 없음) 건드리지 않는다.
let userC: TestUser;

beforeAll(async () => {
  try {
    userA = await createTestUser();
    userB = await createTestUser();
    userC = await createTestUser();
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
  await admin.auth.admin.deleteUser(userC.id);
});

afterEach(() => {
  mockError = null;
  mockGenerateCallCount = 0;
  mockGenerateLastSystemPrompt = undefined;
  mockIndexDigests.mockReset().mockResolvedValue(undefined);
  mockDeleteDigestVectors.mockReset().mockResolvedValue(undefined);
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
    "넣은 원문은 소유자만 getSource로 볼 수 있다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = noDigests();
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "getSource RLS 테스트 원문",
      });

      const asOwner = await getSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourceId,
      });
      expect(asOwner.body).toBe("getSource RLS 테스트 원문");

      await expect(
        getSource({ supabase: userB.supabase, userId: userB.id, sourceId }),
      ).rejects.toMatchObject({ code: "PGRST116" });
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
          userId: userB.id,
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
        userId: userA.id,
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

  // 이 테스트가 지키는 계약: 재추출로 옛 digest_id를 잃어버린 뒤에도(새 UUID로
  // 바뀌므로) 옛 벡터를 정리 대상으로 잡아낸다 — 못 잡으면 새 결과와 거의 같은
  // 점수의 유령 벡터가 검색 결과에 영구히 섞인다.
  it(
    "재추출하면 옛 다이제스트의 벡터를 정리한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("재추출 벡터 테스트 - 기존");
      const { sourceId, digests: original } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "재추출 벡터 테스트 원문",
      });

      mockGenerated = oneDecision("재추출 벡터 테스트 - 새것");
      await reExtractSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourceId,
      });

      expect(mockDeleteDigestVectors).toHaveBeenCalledWith([original[0]?.id]);
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

  // 이 테스트가 지키는 계약: CASCADE가 Postgres 쪽 digests는 지워도 Qdrant 벡터는
  // 안 건드린다 — deleteSource가 지워질 digest id로 벡터 정리를 직접 트리거해야 한다.
  it(
    "원문을 삭제하면 지워진 다이제스트의 벡터도 함께 정리한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("벡터 정리 테스트 결정");
      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "벡터 정리 테스트 원문",
      });

      await deleteSource({ supabase: userA.supabase, sourceId });

      expect(mockDeleteDigestVectors).toHaveBeenCalledWith([digests[0]?.id]);
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

  // 이 테스트가 지키는 계약: 색인 실패 시 방금 커밋한 digest 행을 되돌린다 — 안
  // 그러면 Postgres엔 있지만 Qdrant엔 없어 영영 안 걸리는 다이제스트가 조용히
  // 남는다. source 행은 pending으로 남아 재추출로 복구할 수 있다.
  it(
    "색인이 실패하면 방금 저장한 다이제스트를 되돌린다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const body = `색인 실패 테스트 원문 ${randomUUID()}`;
      mockGenerated = oneDecision("색인 실패 테스트 결정");
      mockIndexDigests.mockRejectedValueOnce(new Error("Qdrant unavailable"));

      await expect(
        ingestSource({ supabase: userA.supabase, userId: userA.id, body }),
      ).rejects.toThrow("Qdrant unavailable");

      const { data: sources } = await userA.supabase
        .from("sources")
        .select("id, digestion_status")
        .eq("body", body)
        .single();
      expect(sources?.digestion_status).toBe("pending");

      const { data: remainingDigests } = await admin
        .from("digests")
        .select("id")
        .eq("source_id", sources?.id ?? "");
      expect(remainingDigests).toHaveLength(0);
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
        reExtractSource({
          supabase: userA.supabase,
          userId: userA.id,
          sourceId,
        }),
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

  // 이 테스트가 지키는 계약: 원문 하나에 다이제스트가 몇 개든 LLM 호출은 다이제스트
  // 생성 1번뿐이다.
  it(
    "다이제스트가 여럿이어도 LLM 호출은 한 번만 나간다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = twoDecisions(["LLM 호출 테스트 A", "LLM 호출 테스트 B"]);

      const { digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "LLM 호출 횟수 테스트 원문",
      });

      expect(digests).toHaveLength(2);
      expect(mockGenerateCallCount).toBe(1);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "profiles.content_language 설정이 정리 프롬프트에 반영된다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { error } = await admin
        .from("profiles")
        .insert({ user_id: userC.id, content_language: "ko" });
      expect(error).toBeNull();

      mockGenerated = noDigests();
      await ingestSource({
        supabase: userC.supabase,
        userId: userC.id,
        body: "언어 설정 반영 테스트 원문",
      });

      expect(mockGenerateLastSystemPrompt).toContain("Write in Korean");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "profiles 행이 없으면 콘텐츠 언어가 기본값(English)으로 떨어진다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = noDigests();
      await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "프로필 없음 기본값 테스트 원문",
      });

      expect(mockGenerateLastSystemPrompt).toContain("Write in English");
    },
    TEST_TIMEOUT_MS,
  );
});
