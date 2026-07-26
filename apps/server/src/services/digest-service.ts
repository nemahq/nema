import { z } from "zod";

import {
  ASSUMPTION_STALE_DAYS,
  DigestBodySchema,
  type DigestListCursor,
  type DigestListItem,
  DigestStatusSchema,
  type DigestType,
  PENDING_STALE_DAYS,
} from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";
import { parseRelationProposal } from "@server/services/changeset-service";

const DAY_MS = 24 * 60 * 60 * 1000;

// 오래된 판단 서피싱은 미결·가정 두 타입만 대상(product-decisions-log #4) —
// decision/learning/idea는 임계값이 없어 이 맵에서 빠지고 항상 isStale=false다.
const STALE_THRESHOLD_DAYS_BY_TYPE: Partial<Record<DigestType, number>> = {
  pending: PENDING_STALE_DAYS,
  assumption: ASSUMPTION_STALE_DAYS,
};

interface DigestSignal {
  isProcessing: boolean;
  hasPendingReview: boolean;
  isStale: boolean;
}

// select()의 중첩 조인(digest_topics/sources)은 supabase-js 타입 추론이 약해
// 서버 컨벤션(외부 데이터는 as 단언 대신 런타임 가드)에 따라 zod로 형태를 검증한다.
const DigestListRowSchema = z.object({
  id: z.string(),
  public_id: z.string(),
  title: z.string(),
  description: z.string(),
  body: z.unknown(),
  status: DigestStatusSchema,
  extraction_status: z.string(),
  created_at: z.string(),
  digest_topics: z.array(
    z.object({ topic: z.object({ id: z.string(), name: z.string() }) }),
  ),
  sources: z.object({ linking_status: z.string() }).nullable(),
});
type DigestListRow = z.infer<typeof DigestListRowSchema>;

// 처리 중·리뷰 대기·오래됨 세 배지 신호를 페이지 단위로 배치 계산한다(N+1 방지,
// listActiveRelations·listChangesets의 "간선 1회 조회 + 인메모리 계산"과 같은 결).
async function computeDigestSignals(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
  rows: DigestListRow[];
}): Promise<Map<string, DigestSignal>> {
  const { supabase, spaceId, rows } = args;

  const digestIds = rows.map((row) => row.id);

  const { data: statementRows, error: stmtError } = await supabase
    .from("statements")
    .select("id, digest_id")
    .in("digest_id", digestIds);
  throwIfSupabaseError(stmtError);

  const statementIdsByDigest = new Map<string, string[]>();
  const allStatementIds: string[] = [];
  for (const statement of statementRows ?? []) {
    const list = statementIdsByDigest.get(statement.digest_id) ?? [];
    list.push(statement.id);
    statementIdsByDigest.set(statement.digest_id, list);
    allStatementIds.push(statement.id);
  }

  // 판정 대기 — 이 Space의 열린 relation changeset들이 건드리는 진술 id 집합
  // (surface-inventory.md "스레드 탭": "Statement 하나를 주면 걸린 대기 중
  // 변경셋을 돌려주는 조회 하나로 판단" — listPendingRelations와 같은 원재료).
  const { data: openRelationChangesets, error: pendingError } = await supabase
    .from("changesets")
    .select("changes(target_type, data)")
    .eq("space_id", spaceId)
    .eq("type", "relation")
    .eq("status", "open");
  throwIfSupabaseError(pendingError);

  const pendingReviewStatementIds = new Set<string>();
  for (const changeset of openRelationChangesets ?? []) {
    const relationChange = changeset.changes.find(
      (change) => change.target_type === "relation",
    );
    const proposal = parseRelationProposal(relationChange?.data);
    if (proposal) {
      pendingReviewStatementIds.add(proposal.fromId);
      pendingReviewStatementIds.add(proposal.toId);
    }
  }

  // 해소(resolves) — 이 진술이 답/완료 쪽(to)으로 걸린 active 관계가 있으면
  // 이미 해소된 것 — 오래된 판단 배지·필터에서 제외한다(07-modeling.md).
  let resolvedStatementIds = new Set<string>();
  if (allStatementIds.length > 0) {
    const { data: resolvesRows, error: resolvesError } = await supabase
      .from("statement_relations")
      .select("to_id")
      .eq("type", "resolves")
      .eq("status", "active")
      .in("to_id", allStatementIds);
    throwIfSupabaseError(resolvesError);
    resolvedStatementIds = new Set(
      (resolvesRows ?? []).map((relation) => relation.to_id),
    );
  }

  const now = Date.now();
  const signals = new Map<string, DigestSignal>();
  for (const row of rows) {
    const statementIds = statementIdsByDigest.get(row.id) ?? [];
    const isProcessing =
      row.extraction_status === "pending" ||
      row.sources?.linking_status === "pending";
    const hasPendingReview = statementIds.some((id) =>
      pendingReviewStatementIds.has(id),
    );

    const parsedBody = DigestBodySchema.safeParse(row.body);
    const type = parsedBody.success ? parsedBody.data.type : null;
    const staleThresholdDays =
      (type && STALE_THRESHOLD_DAYS_BY_TYPE[type]) ?? null;
    const isOldEnough =
      staleThresholdDays !== null &&
      now - new Date(row.created_at).getTime() >= staleThresholdDays * DAY_MS;
    const isResolved = statementIds.some((id) => resolvedStatementIds.has(id));

    signals.set(row.id, {
      isProcessing,
      hasPendingReview,
      isStale: row.status === "active" && isOldEnough && !isResolved,
    });
  }

  return signals;
}

// 스레드 피드 — Space 스코프 시간순 무한 스크롤(browsing-flow.md "스레드 피드").
// 화면은 이 계약을 쓰는 후속 세션의 몫이라 카드 배지 우선순위 같은 표시 로직은
// 넣지 않는다 — 세 신호(isProcessing/hasPendingReview/isStale)를 있는 그대로 낸다.
export async function listDigests(args: {
  supabase: TypedSupabaseClient;
  spaceId: string;
  topicId?: string;
  staleOnly: boolean;
  cursor: DigestListCursor | null | undefined;
  limit: number;
}): Promise<{ items: DigestListItem[]; nextCursor: DigestListCursor | null }> {
  const { supabase, spaceId, topicId, staleOnly, cursor, limit } = args;

  let topicDigestIds: string[] | null = null;
  if (topicId) {
    const { data: topicLinks, error: topicLinkError } = await supabase
      .from("digest_topics")
      .select("digest_id")
      .eq("topic_id", topicId);
    throwIfSupabaseError(topicLinkError);
    topicDigestIds = (topicLinks ?? []).map((link) => link.digest_id);
    if (topicDigestIds.length === 0) {
      return { items: [], nextCursor: null };
    }
  }

  let query = supabase
    .from("digests")
    .select(
      "id, public_id, title, description, body, status, extraction_status, created_at, digest_topics(topic:topics(id, name)), sources(linking_status)",
    )
    .eq("space_id", spaceId)
    // (created_at, id) 튜플 정렬 — DigestListCursorSchema 주석 참고(created_at 동률 타이브레이커).
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  // 오래된 판단 필터는 active 전용 신호라 topicId와 함께 걸려도 status를 active로
  // 고정한다. 그 외엔 topicId 유무로 Topic 필터의 archived 포함 규칙을 따른다
  // (surface-inventory.md "Topic으로 필터링하면 archived Digest도 보인다").
  if (staleOnly || !topicId) {
    query = query.eq("status", "active");
  } else {
    query = query.in("status", ["active", "archived"]);
  }

  if (topicDigestIds) {
    query = query.in("id", topicDigestIds);
  }

  if (staleOnly) {
    const nowMs = Date.now();
    const pendingCutoff = new Date(
      nowMs - PENDING_STALE_DAYS * DAY_MS,
    ).toISOString();
    const assumptionCutoff = new Date(
      nowMs - ASSUMPTION_STALE_DAYS * DAY_MS,
    ).toISOString();
    query = query.or(
      `and(body->>type.eq.pending,created_at.lt.${pendingCutoff}),and(body->>type.eq.assumption,created_at.lt.${assumptionCutoff})`,
    );
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data: rows, error } = await query;
  throwIfSupabaseError(error);

  const allRows = z.array(DigestListRowSchema).parse(rows ?? []);
  const hasMore = allRows.length > limit;
  const pageRows = hasMore ? allRows.slice(0, limit) : allRows;

  if (pageRows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const lastRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastRow
      ? { createdAt: lastRow.created_at, id: lastRow.id }
      : null;

  const signals = await computeDigestSignals({
    supabase,
    spaceId,
    rows: pageRows,
  });

  const items: DigestListItem[] = pageRows.map((row) => {
    const body = DigestBodySchema.parse(row.body);
    const signal = signals.get(row.id) ?? {
      isProcessing: false,
      hasPendingReview: false,
      isStale: false,
    };
    return {
      id: row.id,
      publicId: row.public_id,
      type: body.type,
      title: row.title,
      description: row.description,
      status: row.status,
      topics: row.digest_topics.map((dt) => ({
        id: dt.topic.id,
        name: dt.topic.name,
      })),
      createdAt: row.created_at,
      isProcessing: signal.isProcessing,
      hasPendingReview: signal.hasPendingReview,
      isStale: signal.isStale,
    };
  });

  return { items, nextCursor };
}

// Digest 단독 아카이브(대체 없음) — 진술 연쇄 archive·manual changeset 기록은
// archive_digest RPC가 담당(관계는 트리거가 처리).
export async function archiveDigest(args: {
  supabase: TypedSupabaseClient;
  digestId: string;
}): Promise<{ changesetId: string }> {
  const { data, error } = await args.supabase.rpc("archive_digest", {
    p_digest_id: args.digestId,
  });
  throwIfSupabaseError(error);
  return { changesetId: data };
}

// 아카이브 되살리기 — 이 Digest를 마지막으로 archive한 changeset을
// revert_changeset으로 되돌린다(review-flow.md "아카이브 되살리기").
export async function restoreDigest(args: {
  supabase: TypedSupabaseClient;
  digestId: string;
}): Promise<{ revertChangesetId: string }> {
  const { data, error } = await args.supabase.rpc("restore_digest", {
    p_digest_id: args.digestId,
  });
  throwIfSupabaseError(error);
  return { revertChangesetId: data };
}
