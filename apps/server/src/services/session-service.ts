import { TRPCError } from "@trpc/server";

import type {
  SessionDraft,
  SessionListInput,
  SessionRetrieval,
  SessionSummary,
} from "@nema-io/shared";
import { SessionDraftSchema, SessionRetrievalSchema } from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import type { TypedSupabaseClient } from "@server/infra/supabase";
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
  supabase: TypedSupabaseClient,
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
  const sessions = (hasMore ? data.slice(0, input.limit) : data).map(toSummary);
  const lastSession = sessions[sessions.length - 1];
  const nextCursor =
    hasMore && lastSession
      ? encodeCursor(lastSession.updatedAt, lastSession.id)
      : null;

  return { items: sessions, nextCursor };
}

export async function getSession(
  supabase: TypedSupabaseClient,
  { sessionId }: { sessionId: string },
): Promise<
  SessionSummary & {
    draft: SessionDraft | null;
    retrievals: SessionRetrieval[];
  }
> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, draft, created_at, updated_at")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(error);

  const { data: retrievalRows, error: retrievalError } = await supabase
    .from("session_retrievals")
    .select("id, session_id, query, body, documents, created_at, updated_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  throwIfSupabaseError(retrievalError);

  const retrievals = retrievalRows
    .map((row) =>
      SessionRetrievalSchema.safeParse({
        id: row.id,
        sessionId: row.session_id,
        query: row.query,
        body: row.body,
        documents: row.documents,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    )
    .filter((r) => r.success)
    .map((r) => r.data);

  return {
    ...toSummary(data),
    draft: data.draft
      ? (SessionDraftSchema.safeParse(data.draft).data ?? null)
      : null,
    retrievals,
  };
}

export async function createSession(
  supabase: TypedSupabaseClient,
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

export async function updateSession({
  supabase,
  sessionId,
  title,
}: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  title: string;
}): Promise<SessionSummary> {
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
  supabase: TypedSupabaseClient,
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

export async function generateSessionTitle({
  supabase,
  providers,
  sessionId,
  content,
}: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  sessionId: string;
  content: string;
}): Promise<string> {
  const { data: existing } = await supabase
    .from("sessions")
    .select("title")
    .eq("id", sessionId)
    .single();

  if (existing?.title) {
    return existing.title;
  }

  const raw = await providers.llm.nano.generateText({
    systemPrompt: SESSION_TITLE_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildSessionTitleMessage(content) }],
  });

  const title = raw.trim();
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
