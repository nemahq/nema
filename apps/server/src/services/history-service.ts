import { TRPCError } from "@trpc/server";

import type {
  HistoryListInput,
  HistoryListItem,
  HistoryListOutput,
  HistoryStatus,
} from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

type IngestionStatus = Database["public"]["Enums"]["ingestion_status"];
type RevisionSource = Database["public"]["Enums"]["revision_source"];

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      !Array.isArray(parsed) ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      throw new Error();
    }
    return { createdAt: parsed[0], id: parsed[1] };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
  }
}

// DB enum은 pending/completed/failed 3종. processing은 History 레벨 합성 값.
function aggregateStatus(statuses: IngestionStatus[]): HistoryStatus {
  if (statuses.some((s) => s === "pending")) {
    return "processing";
  }
  if (statuses.some((s) => s === "failed")) {
    return "failed";
  }
  return "completed";
}

type RevisionRow = {
  history_id: string;
  memory_id: string;
  source: RevisionSource;
  created_at: string;
};

export async function listHistories(
  supabase: TypedSupabaseClient,
  input: HistoryListInput,
): Promise<HistoryListOutput> {
  let historyQuery = supabase
    .from("histories")
    .select("id, created_at, source_session_id")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);

  if (input.cursor) {
    const { createdAt, id } = decodeCursor(input.cursor);
    historyQuery = historyQuery.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );
  }

  const { data: historyRows, error: historyError } = await historyQuery;
  throwIfSupabaseError(historyError);

  const hasMore = historyRows.length > input.limit;
  const pageRows = hasMore ? historyRows.slice(0, input.limit) : historyRows;

  if (pageRows.length === 0) {
    return { items: [], nextCursor: null };
  }

  const historyIds = pageRows.map((r) => r.id);

  const { data: revisionRows, error: revisionError } = await supabase
    .from("memory_revisions")
    .select("history_id, memory_id, source, created_at")
    .in("history_id", historyIds)
    .order("created_at", { ascending: true });
  throwIfSupabaseError(revisionError);

  const memoryIds = Array.from(new Set(revisionRows.map((r) => r.memory_id)));

  const memoryMap = new Map<
    string,
    { title: string | null; ingestionStatus: IngestionStatus }
  >();
  if (memoryIds.length > 0) {
    const { data: memoryRows, error: memoryError } = await supabase
      .from("memories")
      .select("id, title, ingestion_status")
      .in("id", memoryIds);
    throwIfSupabaseError(memoryError);

    for (const row of memoryRows) {
      memoryMap.set(row.id, {
        title: row.title,
        ingestionStatus: row.ingestion_status,
      });
    }
  }

  const revisionsByHistory = new Map<string, RevisionRow[]>();
  for (const rev of revisionRows) {
    const list = revisionsByHistory.get(rev.history_id) ?? [];
    list.push(rev);
    revisionsByHistory.set(rev.history_id, list);
  }

  const items: HistoryListItem[] = [];
  for (const row of pageRows) {
    const revs = revisionsByHistory.get(row.id) ?? [];
    // created_at asc 정렬 내에서 첫 direct revision — primaryMemory 판정 기준
    const firstDirect = revs.find((r) => r.source === "direct");
    if (!firstDirect) {
      continue;
    }

    const primaryMemory = memoryMap.get(firstDirect.memory_id);
    if (!primaryMemory) {
      continue;
    }

    const distinctMemoryIds = Array.from(new Set(revs.map((r) => r.memory_id)));
    const statuses: IngestionStatus[] = [];
    for (const id of distinctMemoryIds) {
      const entry = memoryMap.get(id);
      if (entry) {
        statuses.push(entry.ingestionStatus);
      }
    }

    items.push({
      id: row.id,
      createdAt: row.created_at,
      primaryMemory: {
        id: firstDirect.memory_id,
        name: primaryMemory.title,
      },
      memoryCount: statuses.length,
      sessionId: row.source_session_id,
      status: aggregateStatus(statuses),
    });
  }

  const lastPageRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastPageRow
      ? encodeCursor(lastPageRow.created_at, lastPageRow.id)
      : null;

  return { items, nextCursor };
}
