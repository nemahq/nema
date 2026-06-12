// 진술 엔진 전체 루프 실주행 검증 (E2E) — 임시 검증 스크립트.
//
// 격리 측정(eval 러너)·가짜 임베딩(verify-statement-search)이 우회한
// 워커→DB→Qdrant→검색의 *진짜 배관*을 글 하나로 끝까지 통과시킨다.
//
// 실행 (로컬 supabase + 로컬 qdrant 기동 후):
//   pnpm tsx src/eval/verify-e2e.ts
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
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";
import { createSource } from "@server/services/source-service";
import { searchStatements } from "@server/services/statement-search";

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

const SOURCE_BODY =
  "오늘 김 대리랑 회의했는데, 결제 모듈을 PG사 직접 연동 대신 토스페이먼츠 쓰기로 했어. " +
  "김 대리는 출시가 급하다고 계속 그러고, 직접 연동은 한 달은 걸린다니까. 근데 수수료가 좀 걸리긴 해.";
const SEARCH_QUERY = "결제는 어떤 업체로 정했지?";

const WAIT_POLL_INTERVAL_MS = 2_000;
// 워커 폴링(2초)+LLM 추출 지연을 덮는 여유. 임베딩은 LLM이 없어 더 짧다.
const EXTRACTION_WAIT_TIMEOUT_MS = 90_000;
const EMBEDDING_WAIT_TIMEOUT_MS = 60_000;

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
  const llm = createTieredLlm({ apiKey: requireEnv("OPENAI_API_KEY") });
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
  const { data: source } = await admin
    .from("sources")
    .select("id, status, extraction_status")
    .eq("id", sourceId)
    .single();
  results["① create_source 박제"] =
    source?.id === sourceId && source.status === "active";
  console.log(
    `① 박제: source=${source?.id?.slice(0, 8)} status=${source?.status} extraction=${source?.extraction_status}`,
  );

  // 워커 — service_role deps. poll(추출)·sweep(임베딩) 데몬.
  const worker = createStatementSyncWorker({
    supabase: admin,
    llm: llm.standard,
    embedding,
    vectorStore,
  });

  // ── ② 추출 → Postgres 진술·changeset 저장 ─────────────────────────
  worker.start();
  const extracted = await waitUntil({
    label: "추출 완료",
    timeoutMs: EXTRACTION_WAIT_TIMEOUT_MS,
    check: async () => {
      const { data } = await admin
        .from("sources")
        .select("extraction_status")
        .eq("id", sourceId)
        .single();
      return data?.extraction_status === "completed";
    },
  });
  await worker.stop();

  const { data: statements } = await admin
    .from("statements")
    .select("id, content, type, confidence, ingestion_status")
    .eq("space_id", (await getSpaceId(admin, userId)) ?? "")
    .order("created_at", { ascending: true });
  const { data: changeset } = await admin
    .from("changesets")
    .select("id, type, status")
    .eq("source_id", sourceId)
    .maybeSingle();
  const { count: sourceRefCount } = await admin
    .from("statement_sources")
    .select("*", { count: "exact", head: true })
    .eq("source_id", sourceId);

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
  // sweep은 60초 간격이라, stop→start로 시작직후 sweep 1회를 재트리거해 앞당긴다.
  worker.start();
  const embedded = await waitUntil({
    label: "임베딩 완료",
    timeoutMs: EMBEDDING_WAIT_TIMEOUT_MS,
    check: async () => {
      const { data } = await admin
        .from("statements")
        .select("ingestion_status")
        .eq("space_id", (await getSpaceId(admin, userId)) ?? "");
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
    providers: { llm, embedding, vectorStore },
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

  // 정리
  await admin.auth.admin.deleteUser(userId);
  await createQdrantClient()
    .deleteCollection(EVAL_COLLECTION)
    .catch((cleanupError) =>
      console.warn("qdrant eval collection cleanup failed:", cleanupError),
    );

  console.log("\n=== 결과 ===");
  let allPass = true;
  for (const [label, pass] of Object.entries(results)) {
    console.log(`${pass ? "✅" : "❌"} ${label}`);
    allPass = allPass && pass;
  }
  console.log(
    allPass
      ? "\n전체 루프 통과 — 글이 진술로 쪼개져 저장되고, 뜻 검색으로 한 번 확인됨."
      : "\n막는 문제 있음 — 위 ❌ 단계 확인.",
  );
  process.exit(allPass ? 0 : 1);
}

async function getSpaceId(
  admin: ReturnType<typeof createClient<Database>>,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("space_members")
    .select("space_id")
    .eq("user_id", userId)
    .single();
  return data?.space_id ?? null;
}

main().catch((error) => {
  console.error("e2e verify failed:", error);
  process.exit(1);
});
