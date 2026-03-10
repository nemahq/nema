import type { SupabaseClient } from "@supabase/supabase-js";

import type { SessionListInput, SessionSummary } from "@nema-io/shared";

import { SupabaseError } from "../infra/supabase-error";

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

export async function listSessions(
  supabase: SupabaseClient,
  input: SessionListInput,
) {
  let query = supabase
    .from("sessions")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(input.limit + 1);

  if (input.cursor) {
    query = query.lt("updated_at", input.cursor);
  }

  const { data, error } = await query;
  if (error) {
    throw new SupabaseError("query_failed", error.message, error);
  }

  const hasMore = data.length > input.limit;
  const items = (hasMore ? data.slice(0, input.limit) : data).map(toSummary);
  const nextCursor = hasMore ? items[items.length - 1].updatedAt : null;

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
  if (count === 0) {
    throw new SupabaseError("not_found", `Session ${sessionId} not found`);
  }
}
