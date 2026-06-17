// 진술 엔진 전체 루프 실주행 검증 (E2E) — 임시 검증 스크립트.
//
// 격리 측정(eval 러너)·가짜 임베딩(verify-statement-search)이 우회한
// 워커→DB→Qdrant→검색의 *진짜 배관*을 글 하나로 끝까지 통과시킨다.
//
// 실행 (로컬 supabase + 로컬 qdrant 기동 후, apps/server에서):
//   pnpm tsx src/eval/verify-e2e.ts
// 필요 키: OPENAI_API_KEY(추출)·VOYAGE_API_KEY(임베딩) — loadEnv가 읽는다.
//
// 로컬 인프라를 강제 선점 (staging .env 값보다 먼저 — dotenv는 기존 값을 안 덮는다).
process.env["SUPABASE_URL"] ??= "http://127.0.0.1:54321";
process.env["SUPABASE_ANON_KEY"] ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
process.env["SUPABASE_SERVICE_ROLE_KEY"] ??=
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
process.env["QDRANT_URL"] ??= "http://127.0.0.1:6333";
process.env["QDRANT_API_KEY"] ??= "local-dev";
process.env["QDRANT_COLLECTION"] ??= "statements_e2e";

import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "@server/env";
import type { Database } from "@server/infra/database.types";
import { createVoyageProvider } from "@server/infra/embedding";
import { createTieredLlm } from "@server/infra/llm/models";
import { createStatementSyncWorker } from "@server/infra/statement-sync";
import { chunkForExtraction } from "@server/infra/statement-sync/chunking";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";
import { createSource } from "@server/services/source-service";
import { searchStatements } from "@server/services/statement-search";

import { buildUpperBoundInput } from "./statement-engine/long-input-seeds";

loadEnv(new URL("../..", import.meta.url).pathname);

function requireEnv(name: string): string {
  const envValue = process.env[name];
  if (!envValue) {
    throw new Error(`${name} is required`);
  }
  return envValue;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const EVAL_COLLECTION = requireEnv("QDRANT_COLLECTION");
const QDRANT_URL = requireEnv("QDRANT_URL");

// 셸에 export된 staging env는 위의 ??= 선점을 이긴다 — 이 스크립트는 유저 생성과
// 컬렉션 삭제를 하므로, 로컬 인프라가 아니면 어떤 단계도 밟지 않고 즉시 중단한다.
function assertLocal(name: string, url: string): void {
  if (!url.includes("127.0.0.1") && !url.includes("localhost")) {
    throw new Error(
      `${name} must point to local infrastructure (got: ${url}) — refusing to run against remote`,
    );
  }
}
assertLocal("SUPABASE_URL", SUPABASE_URL);
assertLocal("QDRANT_URL", QDRANT_URL);

const SOURCE_BODY =
  "오늘 김 대리랑 회의했는데, 결제 모듈을 PG사 직접 연동 대신 토스페이먼츠 쓰기로 했어. " +
  "김 대리는 출시가 급하다고 계속 그러고, 직접 연동은 한 달은 걸린다니까. 근데 수수료가 좀 걸리긴 해.";
const SEARCH_QUERY = "결제는 어떤 업체로 정했지?";

const WAIT_POLL_INTERVAL_MS = 2_000;
// 워커 폴링(2초)+LLM 추출 지연을 덮는 여유 — 추출 호출 상한(120초)보다 넉넉히.
// 임베딩은 LLM이 없어 더 짧다.
const EXTRACTION_WAIT_TIMEOUT_MS = 150_000;
// 장문(다청크)은 청크 웨이브(⌈청크÷동시성3⌉) × 호출 상한 — 7청크면 3웨이브
const LONG_EXTRACTION_WAIT_TIMEOUT_MS = 480_000;
// ①~⑤ 전부 도달해야 통과 — 단계를 더하면 같이 올릴 것
const EXPECTED_CHECK_COUNT = 5;
// 상한 합성 입력(~10k 토큰)의 진술 수 하한 — 짧은 시드 4편의 합이라 보수적으로
const LONG_MIN_STATEMENTS = 50;
const EMBEDDING_WAIT_TIMEOUT_MS = 60_000;

// 진단 도구가 인프라 오류를 삼키면 "추출 타임아웃"으로 둔갑한다 — 전 조회에 적용
function expectNoError(label: string, error: { message: string } | null): void {
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(args: {
  label: string;
  check: () => Promise<boolean>;
  timeoutMs: number;
}): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < args.timeoutMs) {
    if (await args.check()) {
      return true;
    }
    await sleep(WAIT_POLL_INTERVAL_MS);
  }
  console.log(`  ⏱  타임아웃: ${args.label} (${args.timeoutMs}ms)`);
  return false;
}

async function main() {
  const results: Record<string, boolean> = {};
  const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 테스트 유저 — 가입 트리거가 개인 Space를 자동 생성
  const email = `e2e-${Date.now()}@test.local`;
  const password = "e2e-verify-password";
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (createUserError) {
    throw createUserError;
  }
  const userId = created.user.id;
  console.log(`테스트 유저: ${userId}`);

  // 어느 단계에서 터져도 요약은 찍히고 유저·컬렉션은 정리된다
  try {
    await runPipeline({ admin, userId, email, password, results });
  } finally {
    await admin.auth.admin
      .deleteUser(userId)
      .then(({ error: deleteError }) => {
        if (deleteError) {
          console.warn("test user cleanup failed:", deleteError.message);
        }
      })
      .catch((cleanupError) =>
        console.warn("test user cleanup failed:", cleanupError),
      );
    await createQdrantClient()
      .deleteCollection(EVAL_COLLECTION)
      .catch((cleanupError) =>
        console.warn("qdrant eval collection cleanup failed:", cleanupError),
      );

    console.log("\n=== 결과 ===");
    let allPass = Object.keys(results).length === EXPECTED_CHECK_COUNT;
    for (const [label, pass] of Object.entries(results)) {
      console.log(`${pass ? "✅" : "❌"} ${label}`);
      allPass = allPass && pass;
    }
    console.log(
      allPass
        ? "\n전체 루프 통과 — 글이 진술로 쪼개져 저장되고, 뜻 검색으로 한 번 확인됨."
        : "\n막는 문제 있음 — 위 ❌ 단계(또는 도달 못 한 단계) 확인.",
    );
    process.exitCode = allPass ? 0 : 1;
  }
}

async function runPipeline(args: {
  admin: ReturnType<typeof createClient<Database>>;
  userId: string;
  email: string;
  password: string;
  results: Record<string, boolean>;
}) {
  const { admin, userId, email, password, results } = args;

  // 유저 토큰 클라이언트 (RLS 경로를 실전과 동일하게 탄다)
  const userClient = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await userClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    throw signInError;
  }

  // providers — 로컬 Qdrant·실제 Voyage/OpenAI. 워커가 진짜 추출·임베딩한다.
  // 추출 타임아웃·reasoning은 worker 내부의 호출 단위 설정(제품 경로)을 그대로 쓴다.
  const { tiers: llm } = createTieredLlm({
    apiKey: requireEnv("OPENAI_API_KEY"),
  });
  const embedding = createVoyageProvider({
    apiKey: requireEnv("VOYAGE_API_KEY"),
  });
  const vectorStore = createQdrantStore(createQdrantClient());
  await vectorStore.ensureCollection();

  // ── ① create_source 박제 ──────────────────────────────────────────
  const { sourceId } = await createSource({
    supabase: userClient,
    body: SOURCE_BODY,
  });
  const { data: source, error: sourceError } = await admin
    .from("sources")
    .select("id, status, extraction_status")
    .eq("id", sourceId)
    .single();
  expectNoError("source 조회", sourceError);
  results["① create_source 박제"] =
    source?.id === sourceId && source.status === "active";
  console.log(
    `① 박제: source=${source?.id?.slice(0, 8)} status=${source?.status} extraction=${source?.extraction_status}`,
  );

  // 워커 — service_role deps. poll(notify 깨우기)·sweep(잔여 pending 줍기) 둘 다
  // 추출→임베딩 전체 사이클을 돈다.
  const worker = createStatementSyncWorker({
    supabase: admin,
    // E2E는 제품 경로(standard tier)를 그대로 미러한다 — 추출·관계 판정 둘 다 standard.
    forTask: () => llm.standard,
    embedding,
    vectorStore,
  });

  // ── ② 추출 → Postgres 진술·changeset 저장 ─────────────────────────
  worker.start();
  const extracted = await waitUntil({
    label: "추출 완료",
    timeoutMs: EXTRACTION_WAIT_TIMEOUT_MS,
    check: async () => {
      const { data, error: pollError } = await admin
        .from("sources")
        .select("extraction_status")
        .eq("id", sourceId)
        .single();
      expectNoError("추출 상태 조회", pollError);
      return data?.extraction_status === "completed";
    },
  });
  await worker.stop();

  const { data: statements, error: statementsError } = await admin
    .from("statements")
    .select("id, content, type, confidence, ingestion_status")
    .eq("space_id", (await getSpaceId(admin, userId)) ?? "")
    .order("created_at", { ascending: true });
  expectNoError("진술 조회", statementsError);
  const { data: changeset, error: changesetError } = await admin
    .from("changesets")
    .select("id, type, status")
    .eq("source_id", sourceId)
    .maybeSingle();
  expectNoError("changeset 조회", changesetError);
  const { count: sourceRefCount, error: refError } = await admin
    .from("statement_sources")
    .select("*", { count: "exact", head: true })
    .eq("source_id", sourceId);
  expectNoError("statement_sources 조회", refError);

  results["② 추출·진술·changeset 저장"] =
    extracted &&
    (statements?.length ?? 0) > 0 &&
    changeset?.type === "ingestion" &&
    changeset.status === "applied" &&
    (sourceRefCount ?? 0) === (statements?.length ?? 0);
  console.log(
    `② 추출: 진술 ${statements?.length ?? 0}개, changeset=${changeset?.type}/${changeset?.status}, statement_sources=${sourceRefCount}`,
  );
  for (const s of statements ?? []) {
    console.log(
      `     - [${s.type}${s.confidence ? "/" + s.confidence : ""}] ${s.content}`,
    );
  }

  // ── ③ 임베딩 → Qdrant upsert ──────────────────────────────────────
  // 정상 경로에선 ②의 사이클이 임베딩까지 이어 처리한다. 재기동은 ②에서 워커를
  // 멈춘 사이 남았을 수 있는 pending을 시작직후 sweep 1회로 줍는 보험이다.
  worker.start();
  const embedded = await waitUntil({
    label: "임베딩 완료",
    timeoutMs: EMBEDDING_WAIT_TIMEOUT_MS,
    check: async () => {
      const { data, error: pollError } = await admin
        .from("statements")
        .select("ingestion_status")
        .eq("space_id", (await getSpaceId(admin, userId)) ?? "");
      expectNoError("임베딩 상태 조회", pollError);
      return (
        (data?.length ?? 0) > 0 &&
        (data ?? []).every((d) => d.ingestion_status === "completed")
      );
    },
  });
  await worker.stop();

  const collectionInfo =
    await createQdrantClient().getCollection(EVAL_COLLECTION);
  results["③ 임베딩·Qdrant upsert"] =
    embedded && (collectionInfo.points_count ?? 0) >= (statements?.length ?? 0);
  console.log(
    `③ 임베딩: ingestion 전부 completed=${embedded}, Qdrant points=${collectionInfo.points_count}`,
  );

  // ── ④ 뜻 검색 → 원장 조회 → 원본 묶음 반환 ────────────────────────
  const searchResult = await searchStatements({
    supabase: userClient,
    // 검색은 vectorStore·embedding만 쓴다 — llm은 타입 충족용(forTask는 standard로 미러).
    providers: {
      llm: { forTask: () => llm.standard },
      embedding,
      vectorStore,
    },
    query: SEARCH_QUERY,
  });
  const hitContents = searchResult.groups.flatMap((g) =>
    g.statements.map((s) => s.content),
  );
  results["④ 검색·원본 묶음 반환"] =
    searchResult.groups.length > 0 &&
    searchResult.groups[0]?.key.kind === "source" &&
    hitContents.some((c) => c.includes("토스"));
  console.log(
    `④ 검색("${SEARCH_QUERY}"): 묶음 ${searchResult.groups.length}개`,
  );
  for (const g of searchResult.groups) {
    console.log(
      `     [${g.key.kind}] sourceCreatedAt=${"sourceCreatedAt" in g.key ? g.key.sourceCreatedAt?.slice(0, 19) : "-"}, 진술 ${g.statements.length}/${g.totalStatementCount}`,
    );
    for (const s of g.statements) {
      console.log(`        · (${s.score.toFixed(3)}) ${s.content}`);
    }
  }

  // ── ⑤ 장문 분할 — 임계선 초과 입력이 여러 청크로 갈려도 한 changeset ──
  // long-input-chunking 6장의 상한 실주행: 다청크 → apply 1회 원자 적용,
  // locator index가 원문 순서로 연속인지(청크 연결 계약)를 실배관에서 본다.
  const longBody = buildUpperBoundInput();
  const expectedChunkCount = chunkForExtraction(longBody).length;
  console.log(
    `⑤ 장문 분할: ${longBody.length}자 (${expectedChunkCount}청크 예상) 박제`,
  );
  const { sourceId: longSourceId } = await createSource({
    supabase: userClient,
    body: longBody,
  });

  worker.start();
  const longExtracted = await waitUntil({
    label: "장문 추출 완료",
    timeoutMs: LONG_EXTRACTION_WAIT_TIMEOUT_MS,
    check: async () => {
      const { data, error: pollError } = await admin
        .from("sources")
        .select("extraction_status")
        .eq("id", longSourceId)
        .single();
      expectNoError("장문 추출 상태 조회", pollError);
      return data?.extraction_status === "completed";
    },
  });
  await worker.stop();

  const { data: longRefs, error: longRefsError } = await admin
    .from("statement_sources")
    .select("locator")
    .eq("source_id", longSourceId);
  expectNoError("장문 statement_sources 조회", longRefsError);
  const { data: longChangesets, error: longChangesetError } = await admin
    .from("changesets")
    .select("id, status")
    .eq("source_id", longSourceId);
  expectNoError("장문 changeset 조회", longChangesetError);

  const indices = (longRefs ?? [])
    .map((r) => {
      const locator = r.locator;
      if (locator && typeof locator === "object" && "index" in locator) {
        return Number((locator as { index: unknown }).index);
      }
      return Number.NaN;
    })
    .sort((a, b) => a - b);
  const indicesContiguous =
    indices.length > 0 && indices.every((value, i) => value === i);

  // 다청크가 한 changeset으로 모인다는 게 이 단계의 핵심 — 입력이 실제로 분할됐는지
  // (단일 청크 fallback이 아닌지) 명시 단정한다.
  results["⑤ 장문 분할 — 다청크 원자 적용·index 연속"] =
    longExtracted &&
    expectedChunkCount >= 2 &&
    (longChangesets?.length ?? 0) === 1 &&
    longChangesets?.[0]?.status === "applied" &&
    indices.length >= LONG_MIN_STATEMENTS &&
    indicesContiguous;
  console.log(
    `⑤ 장문 분할: 추출=${longExtracted}, ${expectedChunkCount}청크→changeset ${longChangesets?.length}개(${longChangesets?.[0]?.status}), ` +
      `진술 ${indices.length}개, index 연속=${indicesContiguous}`,
  );
}

async function getSpaceId(
  admin: ReturnType<typeof createClient<Database>>,
  userId: string,
): Promise<string | null> {
  const { data, error: spaceError } = await admin
    .from("space_members")
    .select("space_id")
    .eq("user_id", userId)
    .single();
  expectNoError("space 조회", spaceError);
  return data?.space_id ?? null;
}

main().catch((error) => {
  console.error("e2e verify failed:", error);
  process.exit(1);
});
