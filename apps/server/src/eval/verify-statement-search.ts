/**
 * 꺼내기 엔진 끝 기준 검증 스크립트 (NEM-124).
 * 로컬 supabase + 로컬 Qdrant에 통제된 시드를 심고 searchStatements를 호출해
 * 격리·원장 재조회·archived 거름·묶음·정렬·형제 수를 확인한다.
 *
 * 실행 (로컬 supabase 기동 + qdrant 도커 기동 후):
 *   SUPABASE_URL=http://127.0.0.1:54321 \
 *   SUPABASE_ANON_KEY=<local anon> \
 *   SUPABASE_SERVICE_ROLE_KEY=<local service role> \
 *   QDRANT_URL=http://127.0.0.1:6333 QDRANT_API_KEY=local-dev \
 *   pnpm tsx src/eval/verify-statement-search.ts
 *
 * 임베딩은 통제된 가짜(쿼리 벡터 고정)라 "뜻" 매칭 품질이 아니라 경로를 검증한다.
 * VOYAGE_API_KEY가 있으면 실제 임베딩으로 바꿔 같은 시드로 의미 검색을 확인할 수 있다.
 */
import { createClient } from "@supabase/supabase-js";

import { loadEnv } from "@server/env";
import type { Database } from "@server/infra/database.types";
import type {
  EmbeddingProvider,
  EmbeddingResult,
} from "@server/infra/embedding";
import { VECTOR_DIMENSION } from "@server/infra/embedding";
import { createQdrantClient, createQdrantStore } from "@server/infra/vector";
import { searchStatements } from "@server/services/statement-search";

loadEnv(new URL("../..", import.meta.url).pathname);

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? "";
const ANON_KEY = process.env["SUPABASE_ANON_KEY"] ?? "";
const SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const COLLECTION = process.env["QDRANT_COLLECTION"] ?? "statements";

// 쿼리 벡터 = e0. 진술 벡터를 cos(θ)·e0 + sin(θ)·e_k로 만들면 점수가 cos(θ)로 통제된다
function vectorWithScore(score: number, axis: number): number[] {
  const v = new Array<number>(VECTOR_DIMENSION).fill(0);
  v[0] = score;
  v[axis] = Math.sqrt(1 - score * score);
  return v;
}

const fakeEmbedding: EmbeddingProvider = {
  providerId: "fake",
  model: "fake-unit",
  dimension: VECTOR_DIMENSION,
  embed(texts): Promise<EmbeddingResult> {
    return Promise.resolve({
      embeddings: texts.map(() => vectorWithScore(1, 1)),
      model: "fake-unit",
      dimension: VECTOR_DIMENSION,
    });
  },
};

async function main() {
  const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

  // 1. 테스트 사용자 — 가입 트리거가 개인 Space를 만든다
  const email = `nem124-verify-${Date.now()}@test.local`;
  const { data: created, error: createUserError } =
    await admin.auth.admin.createUser({
      email,
      password: "verify-password-124",
      email_confirm: true,
    });
  if (createUserError) {
    throw createUserError;
  }
  const userId = created.user.id;

  const { data: membership, error: membershipError } = await admin
    .from("space_members")
    .select("space_id")
    .eq("user_id", userId)
    .single();
  if (membershipError) {
    throw membershipError;
  }
  const spaceId = membership.space_id;
  console.log(`사용자 ${email} / space ${spaceId}`);

  // 남의 Space (격리 검증용)
  const { data: otherUser, error: otherUserError } =
    await admin.auth.admin.createUser({
      email: `nem124-other-${Date.now()}@test.local`,
      password: "verify-password-124",
      email_confirm: true,
    });
  if (otherUserError) {
    throw otherUserError;
  }
  const { data: otherMembership } = await admin
    .from("space_members")
    .select("space_id")
    .eq("user_id", otherUser.user.id)
    .single();
  const otherSpaceId = otherMembership?.space_id;
  if (!otherSpaceId) {
    throw new Error("other space missing");
  }

  // 2. 원문 2 + 무관 원문 1 + 남의 원문 1
  async function createSource(ownerSpaceId: string, body: string) {
    const { data, error } = await admin
      .from("sources")
      .insert({
        space_id: ownerSpaceId,
        body,
        extraction_status: "completed",
      })
      .select("id, created_at")
      .single();
    if (error) {
      throw error;
    }
    return data;
  }
  const sourceA = await createSource(
    spaceId,
    "토스 결제 도입을 결정한 날의 글",
  );
  const sourceB = await createSource(spaceId, "결제 수수료 비교를 정리한 글");
  const sourceC = await createSource(spaceId, "점심 메뉴 잡담");
  const sourceOther = await createSource(otherSpaceId, "남의 토스 글");

  // v2는 진술이 digest에서 나온다(digest_id NOT NULL) — 원문마다 seed용 digest 하나.
  async function createDigest(sourceId: string, ownerSpaceId: string) {
    const { data, error } = await admin
      .from("digests")
      .insert({
        source_id: sourceId,
        space_id: ownerSpaceId,
        title: "eval seed digest",
        description: "search eval fixture",
        body: { type: "decision" },
      })
      .select("id")
      .single();
    if (error) {
      throw error;
    }
    return data.id;
  }
  const digestBySource = new Map<string, string>([
    [sourceA.id, await createDigest(sourceA.id, spaceId)],
    [sourceB.id, await createDigest(sourceB.id, spaceId)],
    [sourceC.id, await createDigest(sourceC.id, spaceId)],
    [sourceOther.id, await createDigest(sourceOther.id, otherSpaceId)],
  ]);

  // 3. 진술 — [원문, 내용, score(쿼리와의 통제된 유사도), 원문순서, status]
  type Seed = {
    source: { id: string };
    content: string;
    score: number;
    index: number;
    status?: "active" | "archived";
    spaceId?: string;
    embed?: boolean;
  };
  const seeds: Seed[] = [
    // 원문 A: 최고점 0.95. 원문 순서는 점수 역순으로 깔아 정렬 분리를 검증
    {
      source: sourceA,
      content: "결제는 토스를 쓰기로 결정했다",
      score: 0.8,
      index: 0,
    },
    {
      source: sourceA,
      content: "토스 선택 이유는 정산 속도다",
      score: 0.95,
      index: 1,
    },
    {
      source: sourceA,
      content: "보류한 대안은 포트원이었다",
      score: 0.7,
      index: 2,
    },
    // A의 형제 (검색에 안 닿음 — 벡터 없음): totalStatementCount에만 반영
    {
      source: sourceA,
      content: "도입 일정은 6월 말이다",
      score: 0,
      index: 3,
      embed: false,
    },
    // A의 archived 형제: 수에서도 빠져야 함
    {
      source: sourceA,
      content: "(취소된 메모)",
      score: 0,
      index: 4,
      status: "archived",
      embed: false,
    },
    // 원문 B: 최고점 0.9 — A보다 아래
    {
      source: sourceB,
      content: "토스 수수료는 2.9%였다",
      score: 0.9,
      index: 0,
    },
    {
      source: sourceB,
      content: "수수료 협상 여지를 물어봐야 한다",
      score: 0.65,
      index: 1,
    },
    // 원문 C: threshold(0.6) 미달 — 잘림
    { source: sourceC, content: "점심은 국밥", score: 0.2, index: 0 },
    // archived인데 벡터가 남은 틈새 상황: 원장 거름으로 빠져야 함
    {
      source: sourceA,
      content: "(archive 직후 벡터 잔존)",
      score: 0.93,
      index: 5,
      status: "archived",
    },
    // 남의 Space 진술 (높은 점수): space 격리로 빠져야 함
    {
      source: sourceOther,
      content: "남의 토스 진술",
      score: 0.99,
      index: 0,
      spaceId: otherSpaceId,
    },
  ];

  const points: Array<{
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }> = [];
  let axis = 1;

  for (const seed of seeds) {
    const ownerSpaceId = seed.spaceId ?? spaceId;
    const digestId = digestBySource.get(seed.source.id);
    if (!digestId) {
      throw new Error(`no digest fixture for source ${seed.source.id}`);
    }
    const { data: statement, error: statementError } = await admin
      .from("statements")
      .insert({
        space_id: ownerSpaceId,
        content: seed.content,
        type: "claim",
        confidence: "certain",
        status: seed.status ?? "active",
        ingestion_status: "completed",
        digest_id: digestId,
      })
      .select("id, created_at")
      .single();
    if (statementError) {
      throw statementError;
    }

    const { error: refError } = await admin.from("statement_sources").insert({
      statement_id: statement.id,
      source_id: seed.source.id,
      locator: { index: seed.index },
    });
    if (refError) {
      throw refError;
    }

    if (seed.embed === false) {
      continue;
    }
    axis += 1;
    points.push({
      // point id = statement_id 계약 (vector-store.ts)
      id: statement.id,
      vector: vectorWithScore(seed.score, axis),
      payload: {
        statement_id: statement.id,
        space_id: ownerSpaceId,
        content: seed.content,
        type: "claim",
        confidence: "certain",
        created_at: statement.created_at,
        embedding_model: "fake-unit",
      },
    });
  }

  // 4. Qdrant 컬렉션 + 시드 벡터
  const qdrant = createQdrantClient();
  const { exists } = await qdrant.collectionExists(COLLECTION);
  if (exists) {
    await qdrant.deleteCollection(COLLECTION);
  }
  await qdrant.createCollection(COLLECTION, {
    vectors: { size: VECTOR_DIMENSION, distance: "Cosine" },
  });
  await qdrant.createPayloadIndex(COLLECTION, {
    field_name: "space_id",
    field_schema: "keyword",
  });
  await qdrant.upsert(COLLECTION, { wait: true, points });
  console.log(`Qdrant에 ${points.length}개 벡터 시드 완료`);

  // 5. 사용자 토큰으로 검색 (RLS 경유)
  const { data: signIn, error: signInError } =
    await admin.auth.signInWithPassword({
      email,
      password: "verify-password-124",
    });
  if (signInError) {
    throw signInError;
  }
  const userClient = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${signIn.session.access_token}` },
    },
  });

  const result = await searchStatements({
    supabase: userClient,
    providers: {
      llm: null as never, // 꺼내기 경로엔 LLM이 없다
      embedding: fakeEmbedding,
      vectorStore: createQdrantStore(qdrant),
    },
    query: "토스 결제 왜 골랐지",
  });

  console.log("\n=== 검색 결과 ===");
  console.log(JSON.stringify(result, null, 2));

  // 6. 끝 기준 검증
  const fail = (msg: string) => {
    console.error(`✗ ${msg}`);
    process.exitCode = 1;
  };
  const ok = (msg: string) => console.log(`✓ ${msg}`);

  const groupIds = result.groups.map((g) => g.key.sourceId);
  if (groupIds.length === 2) {
    ok("묶음 2개 (무관 원문 C·남의 원문은 없음)");
  } else {
    fail(`묶음 수 ${groupIds.length} (기대 2)`);
  }

  if (groupIds[0] === sourceA.id && groupIds[1] === sourceB.id) {
    ok("묶음 간 정렬: A(0.95) → B(0.9) 최고점 내림차순");
  } else {
    fail(`묶음 순서 ${JSON.stringify(groupIds)}`);
  }

  const groupA = result.groups.find((g) => g.key.sourceId === sourceA.id);
  const contentsA = groupA?.statements.map((s) => s.content) ?? [];
  if (
    contentsA.length === 3 &&
    contentsA[0]?.includes("결정했다") &&
    contentsA[1]?.includes("정산 속도") &&
    contentsA[2]?.includes("포트원")
  ) {
    ok("묶음 안 정렬: 점수가 아니라 원문 순서(locator.index)");
  } else {
    fail(`A 묶음 내용/순서 ${JSON.stringify(contentsA)}`);
  }

  if (groupA?.totalStatementCount === 4) {
    ok("형제 수 4: 닿은 3 + 안 닿은 active 1, archived 2개 제외");
  } else {
    fail(`A totalStatementCount ${groupA?.totalStatementCount} (기대 4)`);
  }

  const allContents = result.groups.flatMap((g) =>
    g.statements.map((s) => s.content),
  );
  if (!allContents.some((c) => c.includes("벡터 잔존"))) {
    ok("archived 진술은 벡터가 남아도 원장 거름으로 제외");
  } else {
    fail("archived 진술이 결과에 포함됨");
  }

  if (!allContents.some((c) => c.includes("남의"))) {
    ok("space 격리: 남의 진술 제외");
  } else {
    fail("남의 Space 진술이 결과에 포함됨");
  }

  if (groupA?.key.sourceCreatedAt === sourceA.created_at) {
    ok("묶음 key에 원문 시점(sourceCreatedAt)");
  } else {
    fail("sourceCreatedAt 불일치");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
