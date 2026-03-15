import type { SupabaseClient } from "@supabase/supabase-js";
import { TRPCError } from "@trpc/server";

import type {
  SessionDraft,
  SessionListInput,
  SessionSummary,
} from "@nema-io/shared";
import { SessionDraftSchema } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import {
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";
import {
  buildSessionTitleMessage,
  SESSION_TITLE_SYSTEM_PROMPT,
} from "@server/prompts/session-title";

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
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      !Array.isArray(parsed) ||
      typeof parsed[0] !== "string" ||
      typeof parsed[1] !== "string"
    ) {
      throw new Error();
    }
    return { updatedAt: parsed[0], id: parsed[1] };
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid cursor" });
  }
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
  throwIfSupabaseError(error);

  const hasMore = data.length > input.limit;
  const items = (hasMore ? data.slice(0, input.limit) : data).map(toSummary);
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem ? encodeCursor(lastItem.updatedAt, lastItem.id) : null;

  return { items, nextCursor };
}

export async function getSession(
  supabase: SupabaseClient,
  { sessionId }: { sessionId: string },
): Promise<SessionSummary & { draft: SessionDraft | null }> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, draft, created_at, updated_at")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(error);

  return {
    ...toSummary(data),
    draft: data.draft ? SessionDraftSchema.parse(data.draft) : null,
  };
}

export async function createSession(
  supabase: SupabaseClient,
  { userId, sessionId }: { userId: string; sessionId: string },
): Promise<SessionSummary> {
  const { data, error } = await supabase
    .from("sessions")
    .insert({ id: sessionId, user_id: userId })
    .select("id, title, created_at, updated_at")
    .single();

  throwIfSupabaseError(error);

  return toSummary(data);
}

export async function updateSession(
  supabase: SupabaseClient,
  sessionId: string,
  title: string,
): Promise<SessionSummary> {
  const { data, error } = await supabase
    .from("sessions")
    .update({ title })
    .eq("id", sessionId)
    .select("id, title, created_at, updated_at")
    .single();

  throwIfSupabaseError(error);

  return toSummary(data);
}

export async function deleteSession(
  supabase: SupabaseClient,
  { sessionId }: { sessionId: string },
): Promise<void> {
  const { error, count } = await supabase
    .from("sessions")
    .delete({ count: "exact" })
    .eq("id", sessionId);

  throwIfSupabaseError(error);
  if (!count) {
    throw new SupabaseError("not_found", `Session ${sessionId} not found`);
  }
}

export async function generateSessionTitle(
  supabase: SupabaseClient,
  providers: Providers,
  { sessionId, content }: { sessionId: string; content: string },
): Promise<string> {
  let fullTitle = "";

  for await (const chunk of providers.llm.generateStream({
    systemPrompt: SESSION_TITLE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSessionTitleMessage(content) }],
  })) {
    fullTitle += chunk;
  }

  const title = fullTitle.trim();
  if (!title) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "LLM returned empty title",
    });
  }

  const { error } = await supabase
    .from("sessions")
    .update({ title })
    .eq("id", sessionId);

  if (error) {
    throw new SupabaseError("query_failed", error.message, error);
  }

  return title;
}
