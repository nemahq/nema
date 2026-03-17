import * as Sentry from "@sentry/node";

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

const RECENT_JOBS_WINDOW_MINUTES = 3;

function toSaveJob(row: {
  id: string;
  session_id: string;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}): SaveJob {
  return SaveJobSchema.parse({
    id: row.id,
    sessionId: row.session_id,
    status: row.status,
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
    throw new Error("No active draft to save");
  }

  const { data: job, error: insertError } = await supabase
    .from("save_jobs")
    .insert({
      user_id: userId,
      session_id: sessionId,
      draft_body: draft.body,
      status: "pending" as const,
    })
    .select("id, session_id, status, error_message, created_at, updated_at")
    .single();

  throwIfSupabaseError(insertError);

  // 드래프트 클리어 + 상태 메시지 추가를 병렬 처리
  const statusMessage = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    type: "status",
    content: STATUS_LOG_TYPES.DRAFT_SAVED,
    createdAt: new Date().toISOString(),
  });

  const [clearResult, appendResult] = await Promise.all([
    supabase.from("sessions").update({ draft: null }).eq("id", sessionId),
    supabase.rpc("append_message", {
      p_session_id: sessionId,
      p_message: statusMessage,
    }),
  ]);

  throwIfSupabaseError(clearResult.error);
  throwIfSupabaseError(appendResult.error);

  return toSaveJob(job);
}

export async function processSaveJob(args: {
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

  try {
    await handleSave({
      supabase,
      providers,
      userId,
      sessionId: job.session_id,
      draftBody: job.draft_body,
    });

    const { error } = await supabase
      .from("save_jobs")
      .update({ status: "completed" as const })
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
      Sentry.captureException(updateError);
    }

    throw error;
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
    Sentry.captureException(error);
  }

  const { data } = await args.supabase
    .from("save_jobs")
    .select("id, session_id, status, error_message, created_at, updated_at")
    .eq("id", args.jobId)
    .single();

  if (data) {
    emitSaveJobUpdate(args.userId, toSaveJob(data));
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
    .select("id, session_id, status, error_message, created_at, updated_at")
    .single();

  throwIfSupabaseError(error);

  return toSaveJob(data);
}

export async function listRecentSaveJobs(args: {
  supabase: TypedSupabaseClient;
}): Promise<SaveJob[]> {
  const cutoff = new Date(
    Date.now() - RECENT_JOBS_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { data, error } = await args.supabase
    .from("save_jobs")
    .select("id, session_id, status, error_message, created_at, updated_at")
    .or(`status.in.(pending,processing,failed),created_at.gte.${cutoff}`)
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
