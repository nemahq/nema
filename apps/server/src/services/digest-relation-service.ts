import type {
  Digest,
  DigestDetail,
  DigestRelation,
  DigestRelationType,
  DigestType,
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
// 종류)은 전부 relation-rules.ts의 표에서 읽는다. 갈래를 하나 더 붙일 때 이 파일을
// 안 열어도 되게 하는 게 이 구조의 목적이다 — 중복·충돌을 붙일 때 실제로 지켜졌다.
// 그때 여기서 바뀐 건 판정 로직이 아니라 로그 한 줄(judgment: judgment.name)뿐이다.
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
// 코드가 자른다. 30은 상한(5)의 여섯 배 — 이웃이 전부 엉뚱한 유형이어도 상한을 채울
// 만큼은 남으라고 잡은 값이다. 다이제스트가 수천 개를 넘어 이 여유가 모자라기
// 시작하면(로그에서 30개를 다 긁고도 후보가 상한에 못 미치면) 페이로드 필터로 옮긴다.
const NEIGHBOR_FETCH_LIMIT = 30;

// 이번 배치에 없는 같은 원문 다이제스트의 순서 — 던지기 이전부터 있던 것이라
// 무엇보다 앞선다.
const ORDER_BEFORE_BATCH = -1;

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
        // 갈래를 남긴다 — 갈래가 둘이 되면서 "어느 질문의 판정이 죽었나"가 로그에서
        // 안 보이면, 그 다이제스트에 왜 덜 정확한 관계가 붙었는지 나중에 못 짚는다.
        console.warn(
          `[digest-relations] 판정 실패 — digestId=${digest.id}, judgment=${judgment.name}:`,
          error,
        );
        return { rows: [] as RelationRow[], candidates: [] as Candidate[] };
      }),
    ),
  );

  const saved = await saveRelations({
    supabase,
    rows: judged.flatMap((result) => result.rows),
  });

  return groupByDigest({ supabase, digests, rows: saved });
}

/**
 * 다이제스트 여럿에 이미 이어진 관계를 한 번에 묶어 돌려준다. 이번 배치에서
 * 새로 이은 것만 보는 groupByDigest와 달리, 그 다이제스트에 지금까지 쌓인
 * 관계를 전부 조회한다 — 중복 던지기 재구성(source-service.ts)이 기존 결과를
 * 그대로 돌려줄 때 쓴다.
 */
export async function getRelationsForDigests(args: {
  supabase: TypedSupabaseClient;
  digestIds: string[];
}): Promise<Map<string, DigestRelation[]>> {
  const { supabase, digestIds } = args;
  if (digestIds.length === 0) {
    return new Map();
  }

  // getRelationCounts와 같은 이유로 from·to를 나눠 조회한다 — .or()로 한 번에
  // 담으면 목록이 문자열에 두 번 들어가 다이제스트가 많을 때 GET URL이 프록시
  // 한도를 넘길 수 있다.
  const [
    { data: fromRows, error: fromError },
    { data: toRows, error: toError },
  ] = await Promise.all([
    supabase
      .from("digest_relations")
      .select("from_digest_id, to_digest_id, type")
      .in("from_digest_id", digestIds),
    supabase
      .from("digest_relations")
      .select("from_digest_id, to_digest_id, type")
      .in("to_digest_id", digestIds),
  ]);
  throwIfSupabaseError(fromError);
  throwIfSupabaseError(toError);

  const seenPairs = new Set<string>();
  const rows = [...(fromRows ?? []), ...(toRows ?? [])].filter((row) => {
    const key = `${row.from_digest_id}:${row.to_digest_id}`;
    if (seenPairs.has(key)) {
      return false;
    }
    seenPairs.add(key);
    return true;
  });

  const otherIds = new Set<string>();
  for (const row of rows) {
    otherIds.add(row.from_digest_id);
    otherIds.add(row.to_digest_id);
  }
  const { infoById } = await fetchRelationCounterparts({
    supabase,
    digestIds: [...otherIds],
  });

  return new Map(
    digestIds.map((digestId) => [
      digestId,
      toRelations({ digestId, rows, infoById }),
    ]),
  );
}

/** 그 다이제스트에 붙은 관계 — 하는 쪽·받는 쪽 양쪽 다 뜬다(linking.md 2.3). */
export async function getDigestRelations(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  digestId: string;
}): Promise<DigestRelation[]> {
  const { supabase, userId, digestId } = args;

  // RLS(owner-only)라 남의/없는 digestId는 여기서 not-found로 걸린다. 가려진 것도
  // 마찬가지다(v_visible_digests) — 지워진 다이제스트의 관련 목록이 열리면 안 된다.
  const { error: digestError } = await supabase
    .from("v_visible_digests")
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

  const { infoById, knownIds } = await fetchRelationCounterparts({
    supabase,
    digestIds: otherIds,
  });

  // 로그 저장은 응답을 기다리게 하지 않는다 — 실패 격리뿐 아니라 지연도 격리한다.
  void logGetRelations({ userId, detail: { digestId } });

  return toRelations({ digestId, rows: relations, infoById, knownIds });
}

/**
 * 목록의 다이제스트 여럿에 대해 관계 개수를 한 번에 센다. getDigestRelations와
 * 같은 기준(가려진 상대는 안 센다)이어야 한다 — 안 그러면 목록 개수와 상세 줄 수가
 * 어긋난다(킥오프 참고). fetchRelationCounterparts를 그대로 재사용해 그 기준이
 * 두 곳에서 갈릴 수 없게 한다.
 */
export async function getRelationCounts(args: {
  supabase: TypedSupabaseClient;
  digestIds: string[];
}): Promise<Map<string, number>> {
  const { supabase, digestIds } = args;
  if (digestIds.length === 0) {
    return new Map();
  }

  // .or()로 한 요청에 담으면 목록이 문자열에 두 번(from·to) 들어가 목록이 크면
  // (다이제스트가 많은 페이지) GET URL이 프록시 한도를 넘길 수 있다 — from·to를
  // 각각 .in()으로 나눠 두 요청으로 보낸다. 관계가 배치 안에서 양 끝을 다 걸치면
  // 두 결과에 같은 행이 겹쳐 올 수 있어 합칠 때 중복을 거른다.
  const [
    { data: fromRows, error: fromError },
    { data: toRows, error: toError },
  ] = await Promise.all([
    supabase
      .from("digest_relations")
      .select("from_digest_id, to_digest_id")
      .in("from_digest_id", digestIds),
    supabase
      .from("digest_relations")
      .select("from_digest_id, to_digest_id")
      .in("to_digest_id", digestIds),
  ]);
  throwIfSupabaseError(fromError);
  throwIfSupabaseError(toError);

  const seenPairs = new Set<string>();
  const rows = [...(fromRows ?? []), ...(toRows ?? [])].filter((row) => {
    const key = `${row.from_digest_id}:${row.to_digest_id}`;
    if (seenPairs.has(key)) {
      return false;
    }
    seenPairs.add(key);
    return true;
  });

  const idSet = new Set(digestIds);
  const counterpartsBySubject = new Map<string, string[]>();
  for (const row of rows) {
    addCounterpart({
      map: counterpartsBySubject,
      idSet,
      subjectId: row.from_digest_id,
      counterpartId: row.to_digest_id,
    });
    addCounterpart({
      map: counterpartsBySubject,
      idSet,
      subjectId: row.to_digest_id,
      counterpartId: row.from_digest_id,
    });
  }

  // 한 counterpart가 배치 안의 여러 subject와 관계될 수 있어(각자의 리스트에
  // 한 번씩 실림) flat()만으로는 중복이 남는다 — 조회 목록을 부풀리지 않게 거른다.
  const allCounterpartIds = [
    ...new Set([...counterpartsBySubject.values()].flat()),
  ];
  const { infoById, knownIds } = await fetchRelationCounterparts({
    supabase,
    digestIds: allCounterpartIds,
  });

  // toRelations와 같은 신호 — 가려진 상대는 조용히 빠지는 게 정상이지만, 행
  // 자체가 없는 건 CASCADE 누락이라 목록 개수 쪽에서도 알아채야 한다.
  for (const counterpartId of allCounterpartIds) {
    if (!knownIds.has(counterpartId)) {
      console.warn(
        `[digest-relations] 상대 다이제스트를 못 찾아 개수에서 뺌 — otherId=${counterpartId}`,
      );
    }
  }

  return new Map(
    digestIds.map((digestId) => [
      digestId,
      (counterpartsBySubject.get(digestId) ?? []).filter((id) =>
        infoById.has(id),
      ).length,
    ]),
  );
}

// subjectId가 이번 배치 대상일 때만 그 상대를 붙인다 — 배치 밖 다이제스트의
// 관계까지 세면 안 된다(row가 배치 다이제스트를 한쪽 끝에만 걸고 있을 수 있어서).
function addCounterpart(args: {
  map: Map<string, string[]>;
  idSet: Set<string>;
  subjectId: string;
  counterpartId: string;
}): void {
  const { map, idSet, subjectId, counterpartId } = args;
  if (!idSet.has(subjectId)) {
    return;
  }
  const list = map.get(subjectId);
  if (list) {
    list.push(counterpartId);
  } else {
    map.set(subjectId, [counterpartId]);
  }
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

  // 판정이 던지면 로그도 안 남아, 나중에 보면 "후보가 원래 없었다"와 구분이 안 된다.
  // 문턱·상한을 그 로그로 정할 참이라 그 둘이 섞이면 값을 엉뚱하게 조인다. 실패도
  // 후보와 함께 남기고 던진다.
  const judged = await getRelationJudgmentProvider()
    .generateStructured({
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
    })
    .catch((error: unknown) => {
      void logRelationJudgment({
        userId,
        digestId: digest.id,
        judgment: judgment.name,
        candidates: candidates.map((candidate) =>
          toJudgedCandidate(candidate, JUDGMENT_FAILED),
        ),
      });
      throw error;
    });
  const { verdicts } = judged;

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
    judgment: judgment.name,
    candidates: candidates.map((candidate) =>
      toJudgedCandidate(
        candidate,
        verdictByCandidateId.get(candidate.digest.id) ?? UNANSWERED,
      ),
    ),
  });

  return { rows, candidates };
}

// 판정 결과 자리에 관계 종류·none 말고 들어올 수 있는 값 — 후보가 판정을 못 받은
// 두 경우다. 로그를 볼 때 "관계가 아니었다"와 구별되어야 한다.
const UNANSWERED = "unanswered";
const JUDGMENT_FAILED = "failed";

function toJudgedCandidate(
  candidate: Candidate,
  verdict: string,
): JudgedCandidate {
  return { digestId: candidate.digest.id, score: candidate.score, verdict };
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

  // 가려진 다이제스트는 후보에서 뺀다 — 벡터도 함께 지우니 원래는 안 걸리지만,
  // 그 삭제가 실패해도 경고만 남기는 구조라 고아 벡터가 남을 수 있다(꺼내기 검색이
  // 같은 조건을 거는 것과 같은 이유). 사용자에게 지워진 것이 근거로 되살아나면
  // 관련 목록에 없는 다이제스트의 제목이 뜬다. v_visible_digests(3단 상속 판정)를
  // 읽어 막는다.
  const { data: rows, error } = await supabase
    .from("v_visible_digests")
    .select("id, source_id, type, title, body, created_at")
    .in("id", [...scoreById.keys()])
    .in("type", candidateTypes)
    .returns<DigestDetailRow[]>();
  throwIfSupabaseError(error);

  // 같은 원문 안은 자기보다 앞선 것만 본다 — 배열 순서를 순서로 쓴다. 원문 등장
  // 순서와는 다르지만(유형별로 묶여 나온다) 같은 쌍을 두 번 판정하지 않기 위한
  // 것이라 전순서이기만 하면 된다.
  const orderInBatch = new Map(digests.map((row, order) => [row.id, order]));
  const includeSameSource = judgment.sameSourceScope === "earlierOnly";

  return (rows ?? [])
    .filter((row) => {
      if (row.source_id !== sourceId) {
        return true;
      }
      return (
        includeSameSource &&
        (orderInBatch.get(row.id) ?? ORDER_BEFORE_BATCH) < index
      );
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

// 한 쌍에 관계는 하나라 두 번째는 unique 위반으로 튕긴다(digest_relations_unique_pair).
// 그건 고장이 아니라 "이미 이어져 있다"는 뜻이라 조용히 건너뛴다.
const UNIQUE_VIOLATION = "23505";

// 쌍마다 따로 넣는다. 한 번에 묶으면 한 쌍이 튕길 때 그 원문의 관계가 통째로 날아가는데,
// 방금 판정까지 끝낸 멀쩡한 쌍들을 남의 실패로 같이 잃는 건 너무 비싸다. 한 원문이
// 내는 관계는 많아야 다이제스트 수 × 후보 상한이라 왕복이 늘어도 무겁지 않다.
async function saveRelations(args: {
  supabase: TypedSupabaseClient;
  rows: RelationRow[];
}): Promise<RelationRow[]> {
  const { supabase, rows } = args;
  const saved: RelationRow[] = [];

  for (const row of rows) {
    const { error } = await supabase.from("digest_relations").insert(row);
    if (!error) {
      saved.push(row);
      continue;
    }
    if (error.code === UNIQUE_VIOLATION) {
      continue;
    }
    console.warn(
      `[digest-relations] 관계 저장 실패 — from=${row.from_digest_id}, to=${row.to_digest_id}:`,
      error,
    );
  }

  return saved;
}

// linkRelations 응답용 — 방금 이은 관계를 다이제스트별로 묶어 돌려준다. digests
// 자체는 이미 메모리에 있지만 상대(다른 원문에서 온 기존 다이제스트일 수 있다)의
// public_id까지는 안 들고 있어, getDigestRelations와 같은 fetchRelationCounterparts로
// 다시 조회한다 — 코드가 두 벌로 갈리면 "가려진 상대 제외" 기준도 갈릴 수 있다.
async function groupByDigest(args: {
  supabase: TypedSupabaseClient;
  digests: Digest[];
  rows: RelationRow[];
}): Promise<Map<string, DigestRelation[]>> {
  const { supabase, digests, rows } = args;

  const otherIds = new Set<string>();
  for (const row of rows) {
    otherIds.add(row.from_digest_id);
    otherIds.add(row.to_digest_id);
  }
  const { infoById } = await fetchRelationCounterparts({
    supabase,
    digestIds: [...otherIds],
  });

  return new Map(
    digests.map((digest) => [
      digest.id,
      toRelations({ digestId: digest.id, rows, infoById }),
    ]),
  );
}

function toRelations(args: {
  digestId: string;
  rows: RelationRow[];
  infoById: Map<string, RelationCounterpartInfo>;
  knownIds?: Set<string>;
}): DigestRelation[] {
  const { digestId, rows, infoById, knownIds } = args;

  return rows.flatMap((row) => {
    const end = endOf(row, digestId);
    if (!end) {
      return [];
    }
    const otherId = end === "from" ? row.to_digest_id : row.from_digest_id;
    const info = infoById.get(otherId);
    if (info === undefined) {
      // 가려진 상대라 빠지는 건 정상이다. 행 자체가 없으면 CASCADE가 안 돈 것이라
      // 신호를 남긴다 — 조용히 빼면 관련 목록에서 한 줄이 이유 없이 사라진 걸로만 보인다.
      if (knownIds && !knownIds.has(otherId)) {
        console.warn(
          `[digest-relations] 상대 다이제스트를 못 찾아 관계를 뺌 — digestId=${digestId}, otherId=${otherId}`,
        );
      }
      return [];
    }
    return [
      {
        type: RELATION_PERSPECTIVE_BY_END[row.type][end],
        digestId: otherId,
        publicId: info.publicId,
        title: info.title,
        digestType: info.type,
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

interface RelationCounterpartInfo {
  title: string;
  publicId: string;
  type: DigestType;
}

// 가려진 상대는 정보를 안 실어 관계가 목록에서 빠진다. 그 자리를 "못 찾음"과
// 가르려면 존재 자체(knownIds, base 테이블)와 보임(infoById, v_visible_digests)을
// 따로 물어야 한다 — 가림은 사용자가 지운 정상 경로라 조용히 빠져야 하고, 아예
// 없는 행은 CASCADE가 있는 한 생길 수 없어 경고가 남아야 한다. 판정 자체(3단
// 상속)를 여기서 다시 적지 않으려고 두 번 왕복한다.
async function fetchRelationCounterparts(args: {
  supabase: TypedSupabaseClient;
  digestIds: string[];
}): Promise<{
  infoById: Map<string, RelationCounterpartInfo>;
  knownIds: Set<string>;
}> {
  const { supabase, digestIds } = args;
  if (digestIds.length === 0) {
    return { infoById: new Map(), knownIds: new Set() };
  }

  const [
    { data: allRows, error: allError },
    { data: visibleRows, error: visibleError },
  ] = await Promise.all([
    supabase.from("digests").select("id").in("id", digestIds),
    // DigestDetailRow와 같은 근거로 안전한 캐스팅이다 — digests.type은 NOT
    // NULL이고 v_visible_digests는 필터만 걸 뿐 컬럼을 안 바꾼다.
    supabase
      .from("v_visible_digests")
      .select("id, title, public_id, type")
      .in("id", digestIds)
      .returns<
        Array<{
          id: string;
          title: string;
          public_id: string;
          type: DigestType;
        }>
      >(),
  ]);
  throwIfSupabaseError(allError);
  throwIfSupabaseError(visibleError);

  return {
    infoById: new Map(
      (visibleRows ?? []).map((row) => [
        row.id,
        { title: row.title, publicId: row.public_id, type: row.type },
      ]),
    ),
    knownIds: new Set((allRows ?? []).map((row) => row.id)),
  };
}

// findCandidates의 .returns<>()가 선언하는 실제 행 모양 — digests 테이블 컬럼과
// 같다(v_visible_digests는 필터만 걸 뿐 컬럼을 안 바꾼다).
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
