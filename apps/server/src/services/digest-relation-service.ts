import type {
  Digest,
  DigestDetail,
  DigestRelation,
  DigestRelationType,
  RelationEnd,
} from "@nema-io/shared";
import {
  DigestDetailSchema,
  RELATION_PERSPECTIVE_BY_END,
} from "@nema-io/shared";

import { getRelationJudgmentProvider } from "@server/infra/llm/provider";
import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";
import { getVectorStore } from "@server/infra/vector";
import {
  buildRelationJudgmentMessage,
  buildRelationJudgmentSchema,
  buildRelationJudgmentSystemPrompt,
  isRelationType,
} from "@server/prompts/relation-judgment";
import { logGetRelations } from "@server/services/mcp-tool-call-log-service";
import type { JudgedCandidate } from "@server/services/relation-judgment-log-service";
import { logRelationJudgment } from "@server/services/relation-judgment-log-service";
import type {
  RelationDirection,
  RelationJudgment,
} from "@server/services/relation-rules";
import {
  candidateTypesOf,
  relationTypesOf,
} from "@server/services/relation-rules";

// =============================================================
// 관계 잇기 — 후보 찾기 → 판정 → 방향 붙여 저장.
//
// 이 흐름에는 다이제스트 유형 분기가 없다. 유형마다 다른 것(후보 범위·방향·관계
// 종류)은 전부 relation-rules.ts의 표에서 읽는다. 중복·충돌을 붙일 때 이 파일을
// 안 열어도 되게 하는 게 이 구조의 목적이다.
//
// 아래 세 값은 아직 근거가 얇은 출발점이다. 로컬 실측(원문 3건)에서 실제로 관계가
// 붙은 쌍은 0.62·0.71이었다 — 꺼내기 검색의 대역(최고 0.30)과 아예 다른 자리다.
// 그렇다고 문턱을 그 근처로 올리진 않았다: 관계가 아닌 쌍이 몇 점에 깔리는지는 아직
// 한 건도 못 봤고, 문턱이 높아 놓치면 그 사실 자체가 로그에 안 남아 영영 안 보인다.
// 낮게 두고 상한 5개로 무게를 잡은 다음, relation_judgments에 쌓이는 점수×판정 결과를
// (v_relation_candidates) 보고 올린다.
// =============================================================

const CANDIDATE_LIMIT = 5;
const CANDIDATE_MIN_SCORE = 0.2;

// 색인에는 유형·원문 필터를 걸지 않는다 — 페이로드에 유형을 넣으면 그 필드가 없는
// 기존 벡터가 후보에서 조용히 빠진다. 대신 넉넉히 긁어 와서 Postgres 원장과 맞춰
// 코드가 자른다. 다이제스트가 수천 개를 넘어 이 상한이 유형 필터에 먹히기 시작하면
// 그때 페이로드 필터로 옮긴다.
const NEIGHBOR_FETCH_LIMIT = 30;

interface RelationRow {
  from_digest_id: string;
  to_digest_id: string;
  type: DigestRelationType;
}

interface Candidate {
  digest: DigestDetail;
  score: number;
}

/**
 * 이번 원문에서 나온 다이제스트를 쌓인 것과 잇는다. 다이제스트마다 판정을 하나씩
 * 열고(하나가 실패해도 나머지는 산다), 이어진 관계를 다이제스트별로 돌려준다.
 *
 * 관계가 안 이어져도 던지기는 성공이다 — 다이제스트는 이미 저장·색인됐고 관계는
 * 아무것도 접지 않으므로, 여기서 던지면 사용자는 얻은 것까지 잃는다.
 */
export async function linkRelations(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  digests: Digest[];
  judgment: RelationJudgment;
}): Promise<Map<string, DigestRelation[]>> {
  const { supabase, userId, sourceId, digests, judgment } = args;
  if (digests.length === 0) {
    return new Map();
  }

  const titleById = new Map(digests.map((digest) => [digest.id, digest.title]));

  const judged = await Promise.all(
    digests.map((digest, index) =>
      judgeOne({
        supabase,
        userId,
        sourceId,
        digest,
        index,
        digests,
        judgment,
      }).catch((error: unknown) => {
        console.warn(
          `[digest-relations] 판정 실패 — digestId=${digest.id}:`,
          error,
        );
        return { rows: [] as RelationRow[], candidates: [] as Candidate[] };
      }),
    ),
  );

  for (const { candidates } of judged) {
    for (const candidate of candidates) {
      titleById.set(candidate.digest.id, candidate.digest.title);
    }
  }

  const saved = await saveRelations({
    supabase,
    rows: judged.flatMap((result) => result.rows),
  });

  return groupByDigest({ digests, rows: saved, titleById });
}

/** 그 다이제스트에 붙은 관계 — 하는 쪽·받는 쪽 양쪽 다 뜬다(linking.md 2.3). */
export async function getDigestRelations(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  digestId: string;
}): Promise<DigestRelation[]> {
  const { supabase, userId, digestId } = args;

  // RLS(owner-only)라 남의/없는 digestId는 여기서 not-found로 걸린다.
  const { error: digestError } = await supabase
    .from("digests")
    .select("id")
    .eq("id", digestId)
    .single();
  throwIfSupabaseError(digestError);

  const { data: rows, error } = await supabase
    .from("digest_relations")
    .select("from_digest_id, to_digest_id, type")
    .or(`from_digest_id.eq.${digestId},to_digest_id.eq.${digestId}`);
  throwIfSupabaseError(error);

  const relations = rows ?? [];
  const otherIds = relations.map((row) =>
    row.from_digest_id === digestId ? row.to_digest_id : row.from_digest_id,
  );

  const titleById = await fetchTitles({ supabase, digestIds: otherIds });

  // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
  void logGetRelations({ userId, detail: { digestId } });

  return toRelations({ digestId, rows: relations, titleById });
}

async function judgeOne(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  digest: Digest;
  index: number;
  digests: Digest[];
  judgment: RelationJudgment;
}): Promise<{ rows: RelationRow[]; candidates: Candidate[] }> {
  const { supabase, userId, sourceId, digest, index, digests, judgment } = args;

  const candidates = await findCandidates({
    supabase,
    userId,
    sourceId,
    digest,
    index,
    digests,
    judgment,
  });
  if (candidates.length === 0) {
    return { rows: [], candidates: [] };
  }

  const relationTypes = relationTypesOf(judgment);
  const rules = judgment.pairs[digest.type];
  const promptCandidates = candidates.map((candidate) => {
    const rule = rules[candidate.digest.type];
    return {
      digest: candidate.digest,
      allowedTypes: rule?.types ?? [],
      asksFrom: rule?.direction === "llmDecides",
    };
  });

  const { verdicts } = await getRelationJudgmentProvider().generateStructured({
    systemPrompt: buildRelationJudgmentSystemPrompt(judgment, relationTypes),
    messages: [
      {
        role: "user",
        content: buildRelationJudgmentMessage({
          digest,
          candidates: promptCandidates,
        }),
      },
    ],
    schema: buildRelationJudgmentSchema(relationTypes),
  });

  const rows: RelationRow[] = [];
  const verdictByCandidateId = new Map<string, string>();

  for (const verdict of verdicts) {
    const candidate = candidates[verdict.candidate - 1];
    if (!candidate) {
      console.warn(
        `[digest-relations] 후보 번호가 범위 밖 — digestId=${digest.id}, number=${verdict.candidate}`,
      );
      continue;
    }
    verdictByCandidateId.set(candidate.digest.id, verdict.relation);

    const row = toRelationRow({
      digest,
      candidate: candidate.digest,
      relation: verdict.relation,
      from: verdict.from,
      rule: rules[candidate.digest.type],
    });
    if (row) {
      rows.push(row);
    }
  }

  void logRelationJudgment({
    userId,
    digestId: digest.id,
    candidates: candidates.map(
      (candidate): JudgedCandidate => ({
        digestId: candidate.digest.id,
        score: candidate.score,
        verdict: verdictByCandidateId.get(candidate.digest.id) ?? "unanswered",
      }),
    ),
  });

  return { rows, candidates };
}

async function findCandidates(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sourceId: string;
  digest: Digest;
  index: number;
  digests: Digest[];
  judgment: RelationJudgment;
}): Promise<Candidate[]> {
  const { supabase, userId, sourceId, digest, index, digests, judgment } = args;

  const candidateTypes = candidateTypesOf(judgment, digest.type);
  if (candidateTypes.length === 0) {
    return [];
  }

  const hits = await getVectorStore().searchNeighbors({
    userId,
    digestId: digest.id,
    limit: NEIGHBOR_FETCH_LIMIT,
    minScore: CANDIDATE_MIN_SCORE,
  });
  const scoreById = new Map(
    hits
      .filter((hit) => hit.digestId !== digest.id)
      .map((hit) => [hit.digestId, hit.score]),
  );
  if (scoreById.size === 0) {
    return [];
  }

  const { data: rows, error } = await supabase
    .from("digests")
    .select("id, source_id, type, title, body, created_at")
    .in("id", [...scoreById.keys()])
    .in("type", candidateTypes);
  throwIfSupabaseError(error);

  // 같은 원문 안은 자기보다 앞선 것만 본다 — 배열 순서를 순서로 쓴다. 원문 등장
  // 순서와는 다르지만(유형별로 묶여 나온다) 같은 쌍을 두 번 판정하지 않기 위한
  // 것이라 전순서이기만 하면 된다. 이 배열에 없는 같은 원문 다이제스트는 이번
  // 던지기 이전부터 있던 것이라 앞선 것으로 본다.
  const orderInBatch = new Map(digests.map((row, order) => [row.id, order]));
  const includeSameSource = judgment.sameSourceScope === "earlierOnly";

  return (rows ?? [])
    .filter((row) => {
      if (row.source_id !== sourceId) {
        return true;
      }
      return includeSameSource && (orderInBatch.get(row.id) ?? -1) < index;
    })
    .map((row) => ({
      digest: toDigestDetail(row),
      score: scoreById.get(row.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATE_LIMIT);
}

// 방향은 표가 정한다. llmDecides인 자리만 판정 LLM의 답을 쓰고, 그 답이 없으면
// 시간순으로 추측하는 대신 관계를 안 잇는다 — 잘못 이은 관계는 안 이은 것보다 나쁘다.
const FROM_SIDE_BY_DIRECTION: Record<
  RelationDirection,
  "new" | "candidate" | null
> = {
  newIsFrom: "new",
  candidateIsFrom: "candidate",
  llmDecides: null,
};

function toRelationRow(args: {
  digest: Digest;
  candidate: DigestDetail;
  relation: string;
  from: "new" | "candidate" | null;
  rule: {
    direction: RelationDirection;
    types: readonly DigestRelationType[];
  } | null;
}): RelationRow | null {
  const { digest, candidate, relation, from, rule } = args;
  if (!rule) {
    return null;
  }
  if (!isRelationType(relation, rule.types)) {
    if (relation !== "none") {
      console.warn(
        `[digest-relations] 표에 없는 관계 종류를 답함 — digestId=${digest.id}, candidateId=${candidate.id}, relation=${relation}`,
      );
    }
    return null;
  }

  const fromSide = FROM_SIDE_BY_DIRECTION[rule.direction] ?? from;
  if (!fromSide) {
    console.warn(
      `[digest-relations] 방향을 못 정해 관계를 버림 — digestId=${digest.id}, candidateId=${candidate.id}`,
    );
    return null;
  }

  const fromId = fromSide === "new" ? digest.id : candidate.id;
  const toId = fromSide === "new" ? candidate.id : digest.id;
  return { from_digest_id: fromId, to_digest_id: toId, type: relation };
}

async function saveRelations(args: {
  supabase: TypedSupabaseClient;
  rows: RelationRow[];
}): Promise<RelationRow[]> {
  const { supabase, rows } = args;
  if (rows.length === 0) {
    return [];
  }

  // 이미 이어진 쌍은 건너뛴다 — 같은 사용자가 동시에 두 원문을 던지면 같은 쌍이
  // 양쪽에서 판정될 수 있다. 먼저 이어진 것을 남긴다.
  const { data, error } = await supabase
    .from("digest_relations")
    .upsert(rows, {
      onConflict: "from_digest_id,to_digest_id",
      ignoreDuplicates: true,
    })
    .select("from_digest_id, to_digest_id, type");
  throwIfSupabaseError(error);

  return data ?? [];
}

function groupByDigest(args: {
  digests: Digest[];
  rows: RelationRow[];
  titleById: Map<string, string>;
}): Map<string, DigestRelation[]> {
  const { digests, rows, titleById } = args;
  return new Map(
    digests.map((digest) => [
      digest.id,
      toRelations({ digestId: digest.id, rows, titleById }),
    ]),
  );
}

function toRelations(args: {
  digestId: string;
  rows: RelationRow[];
  titleById: Map<string, string>;
}): DigestRelation[] {
  const { digestId, rows, titleById } = args;

  return rows.flatMap((row) => {
    const end = endOf(row, digestId);
    if (!end) {
      return [];
    }
    const otherId = end === "from" ? row.to_digest_id : row.from_digest_id;
    const title = titleById.get(otherId);
    if (title === undefined) {
      return [];
    }
    return [
      {
        type: RELATION_PERSPECTIVE_BY_END[row.type][end],
        digestId: otherId,
        title,
      },
    ];
  });
}

function endOf(row: RelationRow, digestId: string): RelationEnd | null {
  if (row.from_digest_id === digestId) {
    return "from";
  }
  if (row.to_digest_id === digestId) {
    return "to";
  }
  return null;
}

async function fetchTitles(args: {
  supabase: TypedSupabaseClient;
  digestIds: string[];
}): Promise<Map<string, string>> {
  const { supabase, digestIds } = args;
  if (digestIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("digests")
    .select("id, title")
    .in("id", digestIds);
  throwIfSupabaseError(error);

  return new Map((data ?? []).map((row) => [row.id, row.title]));
}

type DigestDetailRow = Pick<
  Database["public"]["Tables"]["digests"]["Row"],
  "id" | "source_id" | "type" | "title" | "body" | "created_at"
>;

function toDigestDetail(row: DigestDetailRow): DigestDetail {
  return DigestDetailSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    type: row.type,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  });
}
