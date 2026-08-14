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
  listDraftSources,
  listSourcesWithDigests,
  reExtractSource,
  restoreSource,
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
const { mockIndexDigests, mockDeleteDigestVectors, mockLogGetSource } =
  vi.hoisted(() => ({
    mockIndexDigests: vi.fn().mockResolvedValue(undefined),
    mockDeleteDigestVectors: vi.fn().mockResolvedValue(undefined),
    mockLogGetSource: vi.fn().mockResolvedValue(undefined),
  }));
vi.mock("@server/services/digest-index-service", () => ({
  indexDigests: mockIndexDigests,
  deleteDigestVectors: mockDeleteDigestVectors,
}));
// getSource가 로그를 void로(응답을 안 기다리고) 남기므로, 실제 admin 클라이언트로
// mcp_tool_calls 행을 확인하면 삽입 타이밍과 경합한다 — mock으로 "불렸는가"만
// 동기적으로 확인한다.
vi.mock("@server/services/mcp-tool-call-log-service", () => ({
  logGetSource: mockLogGetSource,
}));

// 관계 잇기도 같은 이유로 뺀다 — 후보 검색이 Qdrant를, 판정이 LLM을 실제로 탄다.
// 관계 자체는 digest-relation-service의 단위 테스트가 본다. 안 막으면 이 스위트가
// 던지기마다 외부 호출을 내고, 그 실패는 source-service가 삼켜서 조용히 느려지기만 한다.
const { mockLinkRelations } = vi.hoisted(() => ({
  mockLinkRelations: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@server/services/digest-relation-service", () => ({
  linkRelations: mockLinkRelations,
}));

function noDigests(): GeneratedDigests {
  return {
    sourceTitle: "테스트 원문 제목",
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
  mockLogGetSource.mockReset().mockResolvedValue(undefined);
  mockLinkRelations.mockReset().mockResolvedValue(new Map());
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
      const { data: sourceRow } = await userA.supabase
        .from("sources")
        .select("public_id")
        .eq("id", sourceId)
        .single();
      if (!sourceRow) {
        throw new Error("source row not found");
      }
      const sourcePublicId = sourceRow.public_id;

      const asOwner = await getSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourcePublicId,
        origin: "web",
      });
      expect(asOwner.body).toBe("getSource RLS 테스트 원문");

      await expect(
        getSource({
          supabase: userB.supabase,
          userId: userB.id,
          sourcePublicId,
          origin: "web",
        }),
      ).rejects.toMatchObject({ code: "PGRST116" });
    },
    TEST_TIMEOUT_MS,
  );

  // get_source MCP 도구(apps/mcp/src/server.ts)는 search_digests가 돌려준 내부
  // id를 그대로 이어 부른다 — SourceGetInputSchema 유니언의 이 갈래가 회귀하면
  // CI가 못 잡고 MCP 클라이언트에서만 드러난다.
  it(
    "sourceId(내부 id, MCP 경로)로도 getSource를 부를 수 있다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = noDigests();
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "getSource MCP 경로 테스트 원문",
      });

      const result = await getSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourceId,
        origin: "mcp",
      });
      expect(result.sourceId).toBe(sourceId);
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

  it(
    "재추출은 sources.title도 새 sourceTitle로 갱신한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = {
        ...oneDecision("첫 추출"),
        sourceTitle: "첫 추출 제목",
      };
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "재추출 제목 갱신 테스트 원문",
      });

      mockGenerated = {
        ...oneDecision("재추출된 결과"),
        sourceTitle: "재추출된 제목",
      };
      await reExtractSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourceId,
      });

      const { data: source } = await userA.supabase
        .from("sources")
        .select("name")
        .eq("id", sourceId)
        .single();
      expect(source?.name).toBe("재추출된 제목");
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
    "원문을 휴지통에 넣으면 딸린 다이제스트는 Postgres엔 남지만 안 보이게 된다",
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

      const { data: rawSource } = await admin
        .from("sources")
        .select("trashed_at")
        .eq("id", sourceId)
        .single();
      expect(rawSource?.trashed_at).not.toBeNull();

      const { data: rawDigests } = await admin
        .from("digests")
        .select("id, trashed_at")
        .eq("source_id", sourceId);
      expect(rawDigests).toHaveLength(1);
      // 원문 휴지통행은 딸린 digest 행의 trashed_at을 안 건드린다(가시성은
      // v_visible_digests가 부모 조인으로 파생) — 그런데도 안 보여야 한다.
      expect(rawDigests?.[0]?.trashed_at).toBeNull();

      const { data: visibleDigests } = await admin
        .from("v_visible_digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(visibleDigests).toHaveLength(0);

      const repeat = await deleteSource({
        supabase: userA.supabase,
        sourceId,
      });
      expect(repeat.success).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "휴지통의 원문은 getSource·reExtractSource 둘 다 not-found다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("휴지통에서 안 보일 결정");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "휴지통에서 안 보일 원문",
      });
      await deleteSource({ supabase: userA.supabase, sourceId });

      await expect(
        getSource({
          supabase: userA.supabase,
          userId: userA.id,
          sourceId,
          origin: "web",
        }),
      ).rejects.toThrow();

      await expect(
        reExtractSource({
          supabase: userA.supabase,
          userId: userA.id,
          sourceId,
        }),
      ).rejects.toThrow();
    },
    TEST_TIMEOUT_MS,
  );

  // v_visible_sources·v_visible_digests가 security_invoker=true 없이 만들어지면
  // 뷰 소유자(관례상 postgres) 권한으로 돌아 RLS가 새어 남의 행이 보인다 — 지금
  // 껏 admin(service_role, RLS 우회) 조회로만 이 뷰들을 확인해왔으니, 실제 다른
  // 사용자 세션으로 한 번은 직접 확인해 둔다.
  it(
    "v_visible_sources·v_visible_digests는 다른 사용자에게 안 보인다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("B에게 안 보일 결정");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "B에게 안 보일 원문",
      });

      const { data: sourceRows, error: sourceError } = await userB.supabase
        .from("v_visible_sources")
        .select("id")
        .eq("id", sourceId);
      expect(sourceError).toBeNull();
      expect(sourceRows).toHaveLength(0);

      const { data: digestRows, error: digestError } = await userB.supabase
        .from("v_visible_digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(digestError).toBeNull();
      expect(digestRows).toHaveLength(0);
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
    "휴지통의 원문을 되살리면 다시 보이고 딸린 다이제스트를 재색인한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("되살아날 결정");
      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "되살아날 원문",
      });
      await deleteSource({ supabase: userA.supabase, sourceId });

      const result = await restoreSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourceId,
      });
      expect(result.success).toBe(true);

      const { data: rawSource } = await admin
        .from("sources")
        .select("trashed_at")
        .eq("id", sourceId)
        .single();
      expect(rawSource?.trashed_at).toBeNull();

      const { data: visibleDigests } = await admin
        .from("v_visible_digests")
        .select("id")
        .eq("source_id", sourceId);
      expect(visibleDigests).toHaveLength(1);
      expect(mockIndexDigests).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: userA.id,
          digests: [expect.objectContaining({ id: digests[0]?.id })],
        }),
      );
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "휴지통에 없는 원문을 되살리려 하면 에러 없이 false다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("휴지통에 없는 결정");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "휴지통에 없는 원문",
      });
      // ingestSource 자체가 저장 직후 indexDigests를 부른다 — restoreSource 몫만
      // 보려면 그 호출을 지우고 시작해야 한다.
      mockIndexDigests.mockClear();

      const result = await restoreSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourceId,
      });
      expect(result.success).toBe(false);
      expect(mockIndexDigests).not.toHaveBeenCalled();
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 휴지통 원문은 되살릴 수 없다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("B가 못 되살릴 결정");
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "B가 못 되살릴 원문",
      });
      await deleteSource({ supabase: userA.supabase, sourceId });

      const result = await restoreSource({
        supabase: userB.supabase,
        userId: userB.id,
        sourceId,
      });
      expect(result.success).toBe(false);

      const { data: rawSource } = await admin
        .from("sources")
        .select("trashed_at")
        .eq("id", sourceId)
        .single();
      expect(rawSource?.trashed_at).not.toBeNull();
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

  // 관계는 아무것도 접지 않으므로 없어도 다이제스트는 온전하다 — 여기서 던지면
  // 이미 저장·색인까지 끝난 정리 결과를 관계 하나 때문에 통째로 잃는다.
  it(
    "관계 잇기가 실패해도 던지기는 다이제스트를 그대로 돌려준다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("관계가 안 붙는 결정");
      // 앞 갈래(중복·충돌)만 죽인다 — 뒤 갈래가 이은 것은 그대로 살아야 한다.
      // 둘 다 빈 Map으로 두면 "한 갈래만 잃었다"와 "merge가 통째로 깨졌다"가
      // 똑같이 빈 배열로 보여 구별이 안 된다.
      mockLinkRelations.mockRejectedValueOnce(new Error("qdrant down"));
      mockLinkRelations.mockImplementationOnce(
        (args: { digests: Array<{ id: string }> }) =>
          Promise.resolve(
            new Map(
              args.digests.map((digest) => [
                digest.id,
                [
                  {
                    type: "supports",
                    digestId: digest.id,
                    title: "살아남은 관계",
                  },
                ],
              ]),
            ),
          ),
      );

      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "관계 실패 원문",
      });

      expect(digests).toHaveLength(1);
      expect(digests[0]?.relations).toEqual([
        {
          type: "supports",
          digestId: digests[0]?.id,
          title: "살아남은 관계",
        },
      ]);

      const { data: source } = await userA.supabase
        .from("sources")
        .select("digestion_status")
        .eq("id", sourceId)
        .single();
      expect(source?.digestion_status).toBe("completed");
    },
    TEST_TIMEOUT_MS,
  );

  // 갈래를 병렬로 돌리면 안 되는 이유가 여기 걸려 있다. 다른 원문의 결정↔결정은 두
  // 갈래 모두의 후보라 weaken과 conflict가 같은 쌍에 나올 수 있는데, 한 쌍에 관계는
  // 하나뿐이라(digest_relations_unique_pair) 나중에 넣는 쪽이 조용히 버려진다.
  // 중복·충돌이 먼저여야 겹치는 자리에서 "충돌합니다"가 남는다 — 순서가 뒤집히거나
  // 병렬로 바뀌면 같은 원문을 던져도 매번 다른 관계가 붙는다.
  it(
    "관계 잇기를 갈래마다 한 번씩 부르고, 중복·충돌을 먼저 돈다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("갈래 순서 결정");
      // 호출 순서만 재면 Promise.all로 바뀌어도 통과한다 — 두 갈래가 같은 시점에 떠
      // 있었는지를 함께 본다. 그게 unique 위반의 승자를 뒤집는 자리다.
      let inFlight = 0;
      let maxInFlight = 0;
      mockLinkRelations.mockImplementation(
        async (args: {
          digests: Array<{ id: string }>;
          judgment: { name: string };
        }) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((resolve) => setImmediate(resolve));
          inFlight -= 1;
          return new Map(
            args.digests.map((digest) => [
              digest.id,
              [
                {
                  type: args.judgment.name,
                  digestId: digest.id,
                  title: args.judgment.name,
                },
              ],
            ]),
          );
        },
      );

      const { digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "갈래 순서 원문",
      });

      expect(maxInFlight).toBe(1);
      expect(
        mockLinkRelations.mock.calls.map(
          (call) => (call[0] as { judgment: { name: string } }).judgment.name,
        ),
      ).toEqual(["duplicate_conflict", "support_weaken"]);
      // 두 갈래의 결과가 한 다이제스트 아래로 합쳐진다 — 나중 갈래가 앞 갈래를 덮으면
      // 관계 절반이 응답에서 사라진다.
      expect(digests[0]?.relations.map((relation) => relation.type)).toEqual([
        "duplicate_conflict",
        "support_weaken",
      ]);
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
        .select("id, digestion_status, title, name")
        .eq("body", body);
      expect(sources).toHaveLength(1);
      expect(sources?.[0]?.digestion_status).toBe("pending");
      // 정리 호출 자체가 실패해 title을 쓰는 자리(saveDigestsAndIndex)까지 못
      // 간다 — title은 null로 남고 name이 coalesce로 본문을 대신 돌려줘야 한다.
      expect(sources?.[0]?.title).toBeNull();
      expect(sources?.[0]?.name).toBe(body);
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

  it(
    "다이제스트 여럿을 저장하면 LLM 응답 순서대로 extraction_order가 매겨진다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = twoDecisions(["첫 번째 결정", "두 번째 결정"]);
      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "추출 순서 테스트 원문",
      });
      expect(digests.map((digest) => digest.title)).toEqual([
        "첫 번째 결정",
        "두 번째 결정",
      ]);

      const { data: rows } = await userA.supabase
        .from("digests")
        .select("title, extraction_order")
        .eq("source_id", sourceId)
        .order("extraction_order", { ascending: true });
      expect(rows?.map((row) => row.title)).toEqual([
        "첫 번째 결정",
        "두 번째 결정",
      ]);
      expect(rows?.map((row) => row.extraction_order)).toEqual([0, 1]);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("getSource 로그 출처 구분", () => {
  it(
    "origin이 mcp일 때만 조회 로그를 남긴다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = noDigests();
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "로그 출처 구분 테스트 원문",
      });
      const { data: sourceRow } = await userA.supabase
        .from("sources")
        .select("public_id")
        .eq("id", sourceId)
        .single();
      if (!sourceRow) {
        throw new Error("source row not found");
      }
      const sourcePublicId = sourceRow.public_id;

      await getSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourcePublicId,
        origin: "web",
      });
      expect(mockLogGetSource).not.toHaveBeenCalled();

      await getSource({
        supabase: userA.supabase,
        userId: userA.id,
        sourcePublicId,
        origin: "mcp",
      });
      expect(mockLogGetSource).toHaveBeenCalledWith({
        userId: userA.id,
        detail: { sourceId },
      });
    },
    TEST_TIMEOUT_MS,
  );
});

// userA는 파일 전체(source-service (RLS) describe 포함)가 공유해 누적 원문
// 수가 계속 늘어난다 — 지금(19건+)보다 훨씬 여유 있게 잡아 페이지네이션
// 경계에 안 걸리게 한다. 커서 경계 자체는 격리된 유저를 쓰는 별도
// describe(listSourcesWithDigests 커서 페이지네이션)가 검증한다.
const LIST_WITH_DIGESTS_TEST_LIMIT = 50;
// 픽스처 간 created_at 간격 — 밀리초 정밀도 비교가 실제로 통하는지 보되,
// 클록 튐(NTP 등)에 흔들리지 않을 만큼 넉넉히 벌린다.
const CURSOR_TEST_CREATED_AT_GAP_MS = 1000;

describe("listSourcesWithDigests (RLS)", () => {
  afterEach(() => {
    mockError = null;
  });

  it(
    "다이제스트가 있는 원문만 담는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("목록 필터 테스트 결정");
      const { sourceId: withDigests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "목록 테스트 - 다이제스트 있음",
      });
      mockGenerated = noDigests();
      const { sourceId: withoutDigests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "목록 테스트 - 다이제스트 없음",
      });

      const result = await listSourcesWithDigests({
        supabase: userA.supabase,
        cursor: null,
        limit: LIST_WITH_DIGESTS_TEST_LIMIT,
      });

      expect(
        result.items.some((source) => source.sourceId === withDigests),
      ).toBe(true);
      // 행이 아예 0인 원문은 이 목록의 대상이 아니다 — listDraftSources 몫이다.
      expect(
        result.items.some((source) => source.sourceId === withoutDigests),
      ).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  // 삽입 순서를 그대로 기대값으로 쓰면 order() 절이 통째로 빠져도(우연한 반환
  // 순서가 삽입 순서와 같아) 테스트가 계속 통과한다 — extraction_order를 삽입
  // 순서와 반대로 뒤집어서, 쿼리가 실제로 extraction_order를 보고 정렬하는지를
  // 검증한다.
  it(
    "원문 안 다이제스트를 extraction_order 기준으로 정렬한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = twoDecisions(["목록 정렬 A-1", "목록 정렬 A-2"]);
      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "목록 정렬 역전 테스트 원문",
      });
      const [first, second] = digests;

      // 유니크 제약(source_id, extraction_order) 때문에 곧바로 맞바꿀 수 없어
      // 임시값을 거쳐 순서를 뒤집는다: first(0)↔second(1) → second=0, first=1.
      await admin
        .from("digests")
        .update({ extraction_order: -1 })
        .eq("id", first?.id ?? "");
      await admin
        .from("digests")
        .update({ extraction_order: 0 })
        .eq("id", second?.id ?? "");
      await admin
        .from("digests")
        .update({ extraction_order: 1 })
        .eq("id", first?.id ?? "");

      const result = await listSourcesWithDigests({
        supabase: userA.supabase,
        cursor: null,
        limit: LIST_WITH_DIGESTS_TEST_LIMIT,
      });

      const entry = result.items.find((source) => source.sourceId === sourceId);
      expect(entry?.digests.map((digest) => digest.title)).toEqual([
        "목록 정렬 A-2",
        "목록 정렬 A-1",
      ]);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다이제스트를 전부 가려도 원문 자체는 목록에 남는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("전부 가려질 결정");
      const { sourceId, digests } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "전부 가려지는 원문",
      });
      const { error } = await admin
        .from("digests")
        .update({ trashed_at: new Date().toISOString() })
        .eq("id", digests[0]?.id ?? "");
      expect(error).toBeNull();

      const result = await listSourcesWithDigests({
        supabase: userA.supabase,
        cursor: null,
        limit: LIST_WITH_DIGESTS_TEST_LIMIT,
      });

      const entry = result.items.find((source) => source.sourceId === sourceId);
      expect(entry).toBeDefined();
      expect(entry?.digests).toHaveLength(0);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 원문은 안 보여준다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = oneDecision("B 소유 결정");
      const { sourceId } = await ingestSource({
        supabase: userB.supabase,
        userId: userB.id,
        body: "B 소유 원문",
      });

      const asOther = await listSourcesWithDigests({
        supabase: userA.supabase,
        cursor: null,
        limit: LIST_WITH_DIGESTS_TEST_LIMIT,
      });
      expect(asOther.items.some((source) => source.sourceId === sourceId)).toBe(
        false,
      );
    },
    TEST_TIMEOUT_MS,
  );

  // 이 테스트가 지키는 계약: saveDigestsAndIndex는 digest 행을 커밋한 뒤 맨
  // 마지막에 digestion_status를 completed로 바꾼다 — 그 마지막 UPDATE만
  // 실패하면(드물지만) pending인데 digest 행은 있는 원문이 생긴다. 정상 흐름으론
  // 재현이 안 돼 admin으로 그 상태를 직접 만든다. digestion_status='completed'
  // 조건이 없으면 이 원문이 두 목록에 동시에 뜬다.
  it(
    "digestion_status 갱신만 실패해 pending인데 digest 행이 있는 원문은 초안에만 뜬다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const { data: source, error: sourceError } = await admin
        .from("sources")
        .insert({ user_id: userA.id, body: "상태 갱신 실패 재현 원문" })
        .select("id")
        .single();
      expect(sourceError).toBeNull();
      const { error: digestError } = await admin.from("digests").insert({
        source_id: source?.id ?? "",
        type: "decision",
        title: "상태 갱신 실패 재현 결정",
        body: { choice: "fixture" },
        extraction_order: 0,
      });
      expect(digestError).toBeNull();

      const withDigests = await listSourcesWithDigests({
        supabase: userA.supabase,
        cursor: null,
        limit: LIST_WITH_DIGESTS_TEST_LIMIT,
      });
      const drafts = await listDraftSources({ supabase: userA.supabase });

      expect(withDigests.items.some((s) => s.sourceId === source?.id)).toBe(
        false,
      );
      expect(drafts.some((d) => d.sourceId === source?.id)).toBe(true);
    },
    TEST_TIMEOUT_MS,
  );
});

describe("listSourcesWithDigests 커서 페이지네이션 (RLS)", () => {
  afterEach(() => {
    mockError = null;
  });

  // userA는 파일 전체가 공유해 앞선 describe들의 원문이 이미 쌓여 있다 —
  // 페이지 경계를 정확히 세는 이 테스트들은 그 잔여 원문이 두 번째 페이지에
  // 섞여 들어오면 개수가 안 맞는다. 테스트마다 격리된 유저를 새로 만들어 그
  // 문제를 피한다.
  it(
    "limit+1 트릭으로 다음 페이지 존재 여부를 판정하고, 커서로 이어 받은 항목이 겹치거나 빠지지 않는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const user = await createTestUser();
      try {
        const sourceIds: string[] = [];
        for (const label of ["A", "B", "C"]) {
          mockGenerated = oneDecision(`커서 페이지네이션 ${label}`);
          const { sourceId } = await ingestSource({
            supabase: user.supabase,
            userId: user.id,
            body: `커서 페이지네이션 원문 ${label}`,
          });
          sourceIds.push(sourceId);
        }
        // 삽입 순서(A→B→C)와 반대로 created_at을 매겨, order() 절이 실제로
        // created_at을 보고 정렬하는지 함께 검증한다.
        const baseTime = Date.now();
        const updateResults = await Promise.all(
          sourceIds.map((id, index) =>
            admin
              .from("sources")
              .update({
                created_at: new Date(
                  baseTime +
                    (sourceIds.length - index) * CURSOR_TEST_CREATED_AT_GAP_MS,
                ).toISOString(),
              })
              .eq("id", id),
          ),
        );
        for (const { error } of updateResults) {
          expect(error).toBeNull();
        }

        const firstPage = await listSourcesWithDigests({
          supabase: user.supabase,
          cursor: null,
          limit: 2,
        });
        expect(firstPage.items.map((s) => s.sourceId)).toEqual([
          sourceIds[0],
          sourceIds[1],
        ]);
        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await listSourcesWithDigests({
          supabase: user.supabase,
          cursor: firstPage.nextCursor,
          limit: 2,
        });
        expect(secondPage.items.map((s) => s.sourceId)).toEqual([sourceIds[2]]);
        expect(secondPage.nextCursor).toBeNull();
      } finally {
        await admin.auth.admin.deleteUser(user.id);
      }
    },
    TEST_TIMEOUT_MS,
  );

  // hasMore = rows.length > limit이 실수로 >=로 바뀌면 이 케이스에서만 드러난다
  // — 남은 항목이 정확히 limit개일 때 (더 없어야 하는데) hasMore가 true로
  // 잘못 뜬다. 위 테스트(남은 게 limit보다 적음)만으론 못 잡는다.
  it(
    "남은 항목이 정확히 limit개로 끝나면 다음 페이지가 없다고 판정한다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const user = await createTestUser();
      try {
        const sourceIds: string[] = [];
        for (const label of ["G", "H", "I", "J"]) {
          mockGenerated = oneDecision(`커서 경계 테스트 ${label}`);
          const { sourceId } = await ingestSource({
            supabase: user.supabase,
            userId: user.id,
            body: `커서 경계 테스트 원문 ${label}`,
          });
          sourceIds.push(sourceId);
        }
        const baseTime = Date.now();
        const updateResults = await Promise.all(
          sourceIds.map((id, index) =>
            admin
              .from("sources")
              .update({
                created_at: new Date(
                  baseTime +
                    (sourceIds.length - index) * CURSOR_TEST_CREATED_AT_GAP_MS,
                ).toISOString(),
              })
              .eq("id", id),
          ),
        );
        for (const { error } of updateResults) {
          expect(error).toBeNull();
        }

        const firstPage = await listSourcesWithDigests({
          supabase: user.supabase,
          cursor: null,
          limit: 2,
        });
        expect(firstPage.items).toHaveLength(2);
        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await listSourcesWithDigests({
          supabase: user.supabase,
          cursor: firstPage.nextCursor,
          limit: 2,
        });
        expect(secondPage.items.map((s) => s.sourceId)).toEqual([
          sourceIds[2],
          sourceIds[3],
        ]);
        expect(secondPage.nextCursor).toBeNull();
      } finally {
        await admin.auth.admin.deleteUser(user.id);
      }
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "created_at이 같은 원문도 id를 tie-breaker로 써서 페이지 경계에서 빠뜨리거나 중복하지 않는다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const user = await createTestUser();
      try {
        const sourceIds: string[] = [];
        for (const label of ["D", "E", "F"]) {
          mockGenerated = oneDecision(`커서 동률 테스트 ${label}`);
          const { sourceId } = await ingestSource({
            supabase: user.supabase,
            userId: user.id,
            body: `커서 동률 테스트 원문 ${label}`,
          });
          sourceIds.push(sourceId);
        }
        // 셋의 created_at을 완전히 동률로 만든다 — id tie-breaker가 없으면
        // (created_at, cursor.createdAt) 비교가 두 번째 페이지에서 전부 걸러져
        // 세 번째 항목이 통째로 사라진다.
        const sameCreatedAt = new Date().toISOString();
        const updateResults = await Promise.all(
          sourceIds.map((id) =>
            admin
              .from("sources")
              .update({ created_at: sameCreatedAt })
              .eq("id", id),
          ),
        );
        for (const { error } of updateResults) {
          expect(error).toBeNull();
        }

        const firstPage = await listSourcesWithDigests({
          supabase: user.supabase,
          cursor: null,
          limit: 2,
        });
        expect(firstPage.items).toHaveLength(2);
        expect(firstPage.nextCursor).not.toBeNull();

        const secondPage = await listSourcesWithDigests({
          supabase: user.supabase,
          cursor: firstPage.nextCursor,
          limit: 2,
        });

        const allIds = [...firstPage.items, ...secondPage.items].map(
          (s) => s.sourceId,
        );
        expect(allIds).toHaveLength(sourceIds.length);
        expect(new Set(allIds)).toEqual(new Set(sourceIds));
      } finally {
        await admin.auth.admin.deleteUser(user.id);
      }
    },
    TEST_TIMEOUT_MS,
  );
});

describe("listDraftSources (RLS)", () => {
  afterEach(() => {
    mockError = null;
  });

  it(
    "pending과 다이제스트 0개인 completed만 담고, 다이제스트가 있는 completed는 뺀다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const pendingBody = `초안 테스트 - pending ${randomUUID()}`;
      mockError = new Error("LLM unavailable");
      await expect(
        ingestSource({
          supabase: userA.supabase,
          userId: userA.id,
          body: pendingBody,
        }),
      ).rejects.toThrow();
      mockError = null;
      const { data: pendingSource } = await userA.supabase
        .from("sources")
        .select("id")
        .eq("body", pendingBody)
        .single();

      mockGenerated = noDigests();
      const { sourceId: completedEmpty } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "초안 테스트 - completed 0건",
      });

      mockGenerated = oneDecision("초안 테스트 결정");
      const { sourceId: completedWithDigest } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "초안 테스트 - completed 다이제스트 있음",
      });

      const drafts = await listDraftSources({ supabase: userA.supabase });
      const draftIds = drafts.map((draft) => draft.sourceId);

      expect(draftIds).toContain(pendingSource?.id);
      expect(draftIds).toContain(completedEmpty);
      expect(draftIds).not.toContain(completedWithDigest);
      expect(
        drafts.find((draft) => draft.sourceId === pendingSource?.id)?.status,
      ).toBe("pending");
      expect(
        drafts.find((draft) => draft.sourceId === completedEmpty)?.status,
      ).toBe("completed");
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "다른 사용자의 초안은 안 보여준다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = noDigests();
      const { sourceId } = await ingestSource({
        supabase: userB.supabase,
        userId: userB.id,
        body: "B 소유 초안 원문",
      });

      const asOther = await listDraftSources({ supabase: userA.supabase });
      expect(asOther.some((draft) => draft.sourceId === sourceId)).toBe(false);
    },
    TEST_TIMEOUT_MS,
  );

  // title이 없는 원문(정리가 아직 title을 만들기 전부터 있던 원문)을 재현하려면
  // ingestSource를 우회해 admin으로 직접 넣는다 — ingestSource를 거치면 mock이라도
  // sourceTitle이 항상 채워져 title이 비는 경로를 만들 수 없다.
  it(
    "title이 없는 원문은 이름이 본문 앞 200자로 대체된다 — 200자까지는 그대로, 넘으면 잘리고 말줄임표가 없다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      const exactly200 = "x".repeat(200);
      const over200 = `${"x".repeat(200)}y`;

      const { data: exactSource, error: exactError } = await admin
        .from("sources")
        .insert({ user_id: userA.id, body: exactly200 })
        .select("id")
        .single();
      expect(exactError).toBeNull();
      const { data: overSource, error: overError } = await admin
        .from("sources")
        .insert({ user_id: userA.id, body: over200 })
        .select("id")
        .single();
      expect(overError).toBeNull();

      const drafts = await listDraftSources({ supabase: userA.supabase });

      expect(
        drafts.find((draft) => draft.sourceId === exactSource?.id)?.name,
      ).toBe(exactly200);
      expect(
        drafts.find((draft) => draft.sourceId === overSource?.id)?.name,
      ).toBe(exactly200);
    },
    TEST_TIMEOUT_MS,
  );

  it(
    "정리가 만든 sourceTitle이 title에 저장되고 이름에 그대로 반영된다",
    async () => {
      if (!localDbAvailable) {
        return;
      }
      mockGenerated = { ...noDigests(), sourceTitle: "생성된 원문 제목" };
      const { sourceId } = await ingestSource({
        supabase: userA.supabase,
        userId: userA.id,
        body: "제목 저장 테스트 원문",
      });

      const drafts = await listDraftSources({ supabase: userA.supabase });
      expect(drafts.find((draft) => draft.sourceId === sourceId)?.name).toBe(
        "생성된 원문 제목",
      );
    },
    TEST_TIMEOUT_MS,
  );
});
