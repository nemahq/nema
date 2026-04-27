import { z } from "zod";
import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";

import type {
  HistoryDetailInput,
  HistoryDetailOutput,
  HistoryListInput,
  HistoryListItem,
  HistoryListOutput,
  HistoryRevision,
  HistoryStatus,
  RevisionMemory,
} from "@nema-io/shared";

import type { Database } from "@server/infra/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

type IngestionStatus = Database["public"]["Enums"]["ingestion_status"];
type RevisionSource = Database["public"]["Enums"]["revision_source"];
type UpdateType = Database["public"]["Enums"]["update_type"];

function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(JSON.stringify([createdAt, id])).toString("base64url");
}

// 커서는 .or() 필터 문자열에 직접 보간되므로 타입/포맷을 엄격히 검증
// (createdAt: ISO datetime, id: uuid) — 포맷을 벗어난 값의 PostgREST DSL 주입 차단
const CursorPayloadSchema = z.tuple([
  z.string().datetime({ offset: true }),
  z.string().uuid(),
]);

function decodeCursor(cursor: string): { createdAt: string; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
  } catch (error) {
    Sentry.captureMessage("[history-service] cursor JSON decode failed", {
      level: "warning",
      extra: { cursor, error: String(error) },
    });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
  }

  const result = CursorPayloadSchema.safeParse(parsed);
  if (!result.success) {
    Sentry.captureMessage("[history-service] cursor schema validation failed", {
      level: "warning",
      extra: { cursor, issues: result.error.issues },
    });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
  }

  const [createdAt, id] = result.data;
  return { createdAt, id };
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

type ListRevisionRow = {
  history_id: string;
  memory_id: string | null;
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

  const memoryIds = Array.from(
    new Set(revisionRows.map((r) => r.memory_id).filter((id) => id !== null)),
  );

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

  const revisionsByHistory = new Map<string, ListRevisionRow[]>();
  for (const rev of revisionRows) {
    const list = revisionsByHistory.get(rev.history_id) ?? [];
    list.push(rev);
    revisionsByHistory.set(rev.history_id, list);
  }

  const items: HistoryListItem[] = [];
  for (const row of pageRows) {
    const revs = revisionsByHistory.get(row.id) ?? [];
    // created_at asc 정렬 내에서 첫 direct revision — primaryMemory 판정 기준
    const firstDirect = revs.find(
      (r) => r.source === "direct" && r.memory_id !== null,
    );
    if (!firstDirect || firstDirect.memory_id === null) {
      continue;
    }

    const primaryMemory = memoryMap.get(firstDirect.memory_id);
    if (!primaryMemory) {
      // CASCADE 레이스가 아니면 FK/RLS 무결성 이상 — 조용히 제외하지 말고 가시화
      Sentry.captureMessage(
        "[history-service] primary memory missing from memoryMap",
        {
          level: "warning",
          extra: {
            historyId: row.id,
            memoryId: firstDirect.memory_id,
            revisionId: firstDirect,
          },
        },
      );
      continue;
    }

    const distinctMemoryIds = Array.from(
      new Set(revs.map((r) => r.memory_id).filter((id) => id !== null)),
    );
    const missingMemoryIds: string[] = [];
    const statuses: IngestionStatus[] = [];
    for (const id of distinctMemoryIds) {
      const entry = memoryMap.get(id);
      if (entry) {
        statuses.push(entry.ingestionStatus);
      } else {
        missingMemoryIds.push(id);
      }
    }

    if (missingMemoryIds.length > 0) {
      Sentry.captureMessage(
        "[history-service] revision memories missing from memoryMap",
        {
          level: "warning",
          extra: {
            historyId: row.id,
            missingMemoryIds,
          },
        },
      );
    }

    // 누락된 memory의 status를 알 수 없으므로 완료 확정을 보류(processing)
    const status: HistoryStatus =
      missingMemoryIds.length > 0 ? "processing" : aggregateStatus(statuses);

    items.push({
      id: row.id,
      createdAt: row.created_at,
      primaryMemory: {
        id: firstDirect.memory_id,
        name: primaryMemory.title,
      },
      memoryCount: distinctMemoryIds.length,
      sessionId: row.source_session_id,
      status,
    });
  }

  const lastPageRow = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && lastPageRow
      ? encodeCursor(lastPageRow.created_at, lastPageRow.id)
      : null;

  return { items, nextCursor };
}

type DetailRevisionRow = {
  id: string;
  memory_id: string | null;
  memory_name_snapshot: string;
  prev_body: string | null;
  next_body: string;
  update_type: UpdateType;
  source: RevisionSource;
  created_at: string;
};

function buildRevisionMemory(
  row: DetailRevisionRow,
  memoryMap: Map<
    string,
    { title: string | null; ingestionStatus: IngestionStatus }
  >,
): { memory: RevisionMemory; ingestionStatus: IngestionStatus } {
  if (row.memory_id !== null) {
    const memoryEntry = memoryMap.get(row.memory_id);
    if (memoryEntry) {
      return {
        memory: {
          status: "active",
          id: row.memory_id,
          name: memoryEntry.title ?? row.memory_name_snapshot,
        },
        ingestionStatus: memoryEntry.ingestionStatus,
      };
    }
    Sentry.captureMessage(
      "[history-service] revision memory_id present but missing from memoryMap",
      {
        level: "warning",
        extra: { revisionId: row.id, memoryId: row.memory_id },
      },
    );
  }
  return {
    memory: { status: "deleted", name: row.memory_name_snapshot },
    ingestionStatus: "completed",
  };
}

function buildHistoryRevision({
  row,
  memory,
  ingestionStatus,
}: {
  row: DetailRevisionRow;
  memory: RevisionMemory;
  ingestionStatus: IngestionStatus;
}): HistoryRevision {
  const base = {
    id: row.id,
    memory,
    nextBody: row.next_body,
    source: row.source,
    ingestionStatus,
  };
  if (row.update_type === "create") {
    return { ...base, updateType: "create", prevBody: null };
  }
  return {
    ...base,
    updateType: row.update_type,
    prevBody: row.prev_body ?? "",
  };
}

export async function getHistoryDetail(
  supabase: TypedSupabaseClient,
  input: HistoryDetailInput,
): Promise<HistoryDetailOutput> {
  const { data: historyRows, error: historyError } = await supabase
    .from("histories")
    .select("id, created_at, source_session_id")
    .eq("id", input.historyId);
  throwIfSupabaseError(historyError);

  if (historyRows.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "History not found" });
  }

  const history = historyRows[0];

  const { data: revisionRows, error: revisionError } = await supabase
    .from("memory_revisions")
    .select(
      "id, memory_id, memory_name_snapshot, prev_body, next_body, update_type, source, created_at",
    )
    .eq("history_id", input.historyId);
  throwIfSupabaseError(revisionError);

  const nonNullMemoryIds = Array.from(
    new Set(revisionRows.map((r) => r.memory_id).filter((id) => id !== null)),
  );

  const memoryMap = new Map<
    string,
    { title: string | null; ingestionStatus: IngestionStatus }
  >();
  if (nonNullMemoryIds.length > 0) {
    const { data: memoryRows, error: memoryError } = await supabase
      .from("memories")
      .select("id, title, ingestion_status")
      .in("id", nonNullMemoryIds);
    throwIfSupabaseError(memoryError);

    for (const row of memoryRows) {
      memoryMap.set(row.id, {
        title: row.title,
        ingestionStatus: row.ingestion_status,
      });
    }
  }

  const sorted = [...revisionRows].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === "direct" ? -1 : 1;
    }
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const revisions: HistoryRevision[] = sorted.map((row) => {
    const { memory, ingestionStatus } = buildRevisionMemory(row, memoryMap);
    return buildHistoryRevision({ row, memory, ingestionStatus });
  });

  // Memory가 없으면 ingestion 상태를 평가할 수 없으므로 집계에서 제외 —
  // 모두 deleted면 빈 배열로 떨어져 자연스럽게 completed가 됨.
  const activeStatuses: IngestionStatus[] = sorted.flatMap((r) => {
    if (r.memory_id === null) {
      return [];
    }
    const entry = memoryMap.get(r.memory_id);
    return entry ? [entry.ingestionStatus] : [];
  });

  return {
    id: history.id,
    createdAt: history.created_at,
    sessionId: history.source_session_id,
    status: aggregateStatus(activeStatuses),
    revisions,
  };
}
