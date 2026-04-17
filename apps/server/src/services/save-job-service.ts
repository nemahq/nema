import * as Sentry from "@sentry/node";
import { TRPCError } from "@trpc/server";

import {
  MessageSchema,
  type SaveJob,
  SaveJobSchema,
  SessionDraftSchema,
  STATUS_LOG_TYPES,
} from "@nema-io/shared";

import type { Providers } from "@server/infra/providers";
import { emitSaveJobUpdate } from "@server/infra/save-job-emitter";
import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

import { handleSave } from "./chat/saving";
import { getProfile } from "./profile-service";

const SNIPPET_MAX_LENGTH = 30;
const SAVE_JOB_COLUMNS =
  "id, session_id, status, snippet, error_message, created_at, updated_at" as const;

function extractSnippet(body: string): string | null {
  const normalized = body.trim().replace(/\n/g, " ");
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length <= SNIPPET_MAX_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, SNIPPET_MAX_LENGTH)}…`;
}

function toSaveJob(row: {
  id: string;
  session_id: string;
  status: string;
  snippet: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}): SaveJob {
  return SaveJobSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
    snippet: row.snippet,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function enqueueSaveJob(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  sessionId: string;
}): Promise<SaveJob> {
  const { supabase, userId, sessionId } = args;

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("draft")
    .eq("id", sessionId)
    .single();

  throwIfSupabaseError(sessionError);

  const draft = session.draft ? SessionDraftSchema.parse(session.draft) : null;
  if (!draft) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "No active draft to save",
    });
  }

  const snippet = extractSnippet(draft.body);

  const { data: job, error: insertError } = await supabase
    .from("save_jobs")
    .insert({
      user_id: userId,
      session_id: sessionId,
      draft_body: draft.body,
      snippet,
      status: "pending" as const,
    })
    .select(SAVE_JOB_COLUMNS)
    .single();

  throwIfSupabaseError(insertError);

  const { error: clearError } = await supabase
    .from("sessions")
    .update({ draft: null })
    .eq("id", sessionId);

  throwIfSupabaseError(clearError);

  return toSaveJob(job);
}

async function appendSaveStatusMessage(args: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  titles: string[];
}): Promise<void> {
  const { supabase, sessionId, titles } = args;

  const statusMessage = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    type: "status",
    content: STATUS_LOG_TYPES.DRAFT_SAVED,
    meta: { titles: titles.join(", ") },
    createdAt: new Date().toISOString(),
  });

  const { error } = await supabase.rpc("append_message", {
    p_session_id: sessionId,
    p_message: statusMessage,
  });

  throwIfSupabaseError(error);
}

async function processSaveJob(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  jobId: string;
}): Promise<void> {
  const { supabase, providers, userId, jobId } = args;

  const { error: processingError } = await supabase
    .from("save_jobs")
    .update({ status: "processing" as const })
    .eq("id", jobId);

  throwIfSupabaseError(processingError);

  const { data: job, error: fetchError } = await supabase
    .from("save_jobs")
    .select("draft_body, session_id")
    .eq("id", jobId)
    .single();

  throwIfSupabaseError(fetchError);

  // 처리 완료 후 null로 비우는 컬럼이라 reader 경로에서는 값이 있어야 정상
  if (job.draft_body === null) {
    throw new Error(
      `save_jobs(${jobId}).draft_body is null — job may have already been processed`,
    );
  }

  const profile = await getProfile(supabase, { userId });
  if (!profile) {
    throw new Error("Save job requires a user profile");
  }
  const contentLanguage = profile.contentLanguage;

  let titles: string[];
  let historyId: string;
  try {
    const result = await handleSave({
      supabase,
      providers,
      userId,
      sessionId: job.session_id,
      draftBody: job.draft_body,
      contentLanguage,
    });
    titles = result.titles;
    historyId = result.historyId;

    // 링크 실패가 저장 완료 신호를 막으면 안 된다 (memories는 이미 기록됨). PG error/네트워크 reject 모두 흡수.
    try {
      const { error: linkError } = await supabase.rpc("link_draft_to_history", {
        p_session_id: job.session_id,
        p_history_id: historyId,
      });
      if (linkError) {
        Sentry.captureException(linkError, {
          tags: { component: "save-job" },
          extra: { jobId, context: "link draft to history" },
        });
      }
    } catch (linkError) {
      Sentry.captureException(linkError, {
        tags: { component: "save-job" },
        extra: { jobId, context: "link draft to history" },
      });
    }

    const { error } = await supabase
      .from("save_jobs")
      .update({
        status: "completed" as const,
        history_id: historyId,
        draft_body: null,
      })
      .eq("id", jobId);

    throwIfSupabaseError(error);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    const { error: updateError } = await supabase
      .from("save_jobs")
      .update({
        status: "failed" as const,
        error_message: errorMessage,
      })
      .eq("id", jobId);

    if (updateError) {
      Sentry.captureException(updateError, {
        tags: { component: "save-job" },
        extra: { jobId, originalError: errorMessage },
      });
    }

    throw error;
  }

  try {
    await appendSaveStatusMessage({
      supabase,
      sessionId: job.session_id,
      titles,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "save-job" },
      extra: { jobId, context: "status message append" },
    });
  }
}

export async function processSaveJobBackground(args: {
  supabase: TypedSupabaseClient;
  providers: Providers;
  userId: string;
  jobId: string;
}): Promise<void> {
  try {
    await processSaveJob(args);
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "save-job" },
      extra: { jobId: args.jobId, userId: args.userId },
    });
  }

  try {
    const { data } = await args.supabase
      .from("save_jobs")
      .select(SAVE_JOB_COLUMNS)
      .eq("id", args.jobId)
      .single();

    if (data) {
      emitSaveJobUpdate(args.userId, toSaveJob(data));
    }
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "save-job" },
      extra: { jobId: args.jobId, userId: args.userId },
    });
  }
}

export async function retrySaveJob(args: {
  supabase: TypedSupabaseClient;
  jobId: string;
}): Promise<SaveJob> {
  const { supabase, jobId } = args;

  const { data, error } = await supabase
    .from("save_jobs")
    .update({ status: "pending" as const, error_message: null })
    .eq("id", jobId)
    .eq("status", "failed" as const)
    .select(SAVE_JOB_COLUMNS)
    .single();

  throwIfSupabaseError(error);

  return toSaveJob(data);
}

export async function listRecentSaveJobs(args: {
  supabase: TypedSupabaseClient;
}): Promise<SaveJob[]> {
  const { data, error } = await args.supabase
    .from("save_jobs")
    .select(SAVE_JOB_COLUMNS)
    .in("status", ["pending", "processing", "failed"])
    .order("created_at", { ascending: false });

  throwIfSupabaseError(error);

  return (data ?? []).map(toSaveJob);
}

export async function failStaleSaveJobs(
  supabase: TypedSupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("fail_stale_save_jobs");

  if (error) {
    Sentry.captureException(error);
    return 0;
  }

  return typeof data === "number" ? data : 0;
}
