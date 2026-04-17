import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";

import type {
  DocumentDetail,
  DocumentListInput,
  DocumentSummary,
} from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

function toSummary(row: {
  id: string;
  title: string | null;
  tags: string[] | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    tags: row.tags,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

export async function listDocuments(
  supabase: TypedSupabaseClient,
  input: DocumentListInput,
) {
  let query = supabase
    .from("memories")
    .select("id, title, tags, summary, created_at, updated_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);

  if (input.cursor) {
    const { createdAt, id } = decodeCursor(input.cursor);
    query = query.or(
      `created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`,
    );
  }

  const { data, error } = await query;
  throwIfSupabaseError(error);

  const hasMore = data.length > input.limit;
  const documents = (hasMore ? data.slice(0, input.limit) : data).map(
    toSummary,
  );
  const lastDoc = documents[documents.length - 1];
  const nextCursor =
    hasMore && lastDoc ? encodeCursor(lastDoc.createdAt, lastDoc.id) : null;

  return { items: documents, nextCursor };
}

export async function getDocument(
  supabase: TypedSupabaseClient,
  { documentId }: { documentId: string },
): Promise<DocumentDetail> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, title, tags, summary, body, created_at, updated_at")
    .eq("id", documentId)
    .single();

  throwIfSupabaseError(error);

  return {
    ...toSummary(data),
    body: data.body,
  };
}

export async function deleteDocument(
  supabase: TypedSupabaseClient,
  { documentId, userId }: { documentId: string; userId: string },
): Promise<void> {
  // TODO(NEM-86): PGMQ 연동 삭제 이벤트 재구현 (Qdrant/Neo4j orphan 정리)
  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", documentId)
    .eq("user_id", userId);

  throwIfSupabaseError(error);

  // NEM-86 배포 전까지 Qdrant/Neo4j orphan이 남음 — 추후 백필 대상 추적용
  Sentry.captureMessage(
    "[deleteDocument] NEM-86 pending: Qdrant/Neo4j orphan retained",
    { level: "info", extra: { memoryId: documentId, userId } },
  );
}
