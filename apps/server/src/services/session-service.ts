import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionListInput, SessionSummary } from "@nema-io/shared";

import { SupabaseError } from "@server/infra/supabase-error";

function toSummary(row: {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}): SessionSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function encodeCursor(updatedAt: string, id: string): string {
  return Buffer.from(JSON.stringify([updatedAt, id])).toString("base64url");
}

function decodeCursor(cursor: string): { updatedAt: string; id: string } {
  const [updatedAt, id] = JSON.parse(
    Buffer.from(cursor, "base64url").toString(),
  ) as [string, string];
  return { updatedAt, id };
}

export async function listSessions(
  supabase: SupabaseClient,
  input: SessionListInput,
) {
  let query = supabase
    .from("sessions")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(input.limit + 1);

  if (input.cursor) {
    const { updatedAt, id } = decodeCursor(input.cursor);
    query = query.or(
      `updated_at.lt.${updatedAt},and(updated_at.eq.${updatedAt},id.lt.${id})`,
    );
  }

  const { data, error } = await query;
  if (error) {
    throw new SupabaseError("query_failed", error.message, error);
  }

  const hasMore = data.length > input.limit;
  const items = (hasMore ? data.slice(0, input.limit) : data).map(toSummary);
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem ? encodeCursor(lastItem.updatedAt, lastItem.id) : null;

  return { items, nextCursor };
}

export async function createSession(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionSummary> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ user_id: userId })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    throw new SupabaseError("query_failed", error.message, error);
  }

  return toSummary(data);
}

export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error, count } = await supabase
    .from("sessions")
    .delete({ count: "exact" })
    .eq("id", sessionId);

  if (error) {
    throw new SupabaseError("query_failed", error.message, error);
  }
  if (!count) {
    throw new SupabaseError("not_found", `Session ${sessionId} not found`);
  }
}
