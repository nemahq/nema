import { TRPCError } from "@trpc/server";

import type {
  Draft,
  DraftConfirmInput,
  DraftCreateInput,
  DraftEditInput,
} from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

// 1인 단계: 가입 트리거가 만든 개인 Space 1개. 멀티 Space가 열리면 입력으로 받는다 —
// 그때까지 가장 오래된 Space가 개인 칸 (source-service와 같은 규약).
async function resolvePersonalSpaceId(
  supabase: TypedSupabaseClient,
): Promise<string> {
  const { data, error } = await supabase
    .from("space_members")
    .select("space_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  throwIfSupabaseError(error);
  return data.space_id;
}

function toDraft(row: {
  id: string;
  origin: Draft["origin"];
  title: string | null;
  body: string;
  proposed_topics: string[];
  created_at: string;
  updated_at: string;
}): Draft {
  return {
    id: row.id,
    origin: row.origin,
    title: row.title,
    body: row.body,
    proposedTopics: row.proposed_topics ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const DRAFT_COLUMNS =
  "id, origin, title, body, proposed_topics, created_at, updated_at";

export async function createDraft(args: {
  supabase: TypedSupabaseClient;
  input: DraftCreateInput;
}): Promise<{ draftId: string }> {
  const { supabase, input } = args;

  // DB 컬럼이 `body text NOT NULL DEFAULT ''`라 빈 본문도 저장된다 — 두 입구가 지나는
  // 이 chokepoint에서 막아, tRPC edge를 안 거치는 호출부(assist)에서도 불변식을 강제한다.
  if (input.body.trim() === "") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Draft body must not be empty",
    });
  }

  const spaceId = await resolvePersonalSpaceId(supabase);

  const { data, error } = await supabase.rpc("create_draft", {
    p_space_id: spaceId,
    p_origin: input.origin,
    p_body: input.body,
    p_title: input.title,
    p_proposed_topics: input.proposedTopics,
  });
  throwIfSupabaseError(error);

  return { draftId: data };
}

// 부분 갱신 — 빠진 필드는 undefined로 보내 RPC default(NULL)가 기존값을 유지하게 한다.
export async function editDraft(args: {
  supabase: TypedSupabaseClient;
  input: DraftEditInput;
}): Promise<void> {
  const { supabase, input } = args;
  const { error } = await supabase.rpc("update_draft", {
    p_draft_id: input.draftId,
    p_title: input.title,
    p_body: input.body,
    p_proposed_topics: input.proposedTopics,
  });
  throwIfSupabaseError(error);
}

export async function deleteDraft(args: {
  supabase: TypedSupabaseClient;
  draftId: string;
}): Promise<void> {
  const { error } = await args.supabase.rpc("delete_draft", {
    p_draft_id: args.draftId,
  });
  throwIfSupabaseError(error);
}

// 확정 게이트 — confirm_draft가 create_source 재사용 + 제목/주제 연결 + 초안 삭제를
// 한 트랜잭션으로 처리하고 박제된 source_id를 돌려준다. 그 뒤는 기존 추출 워커.
export async function confirmDraft(args: {
  supabase: TypedSupabaseClient;
  input: DraftConfirmInput;
}): Promise<{ sourceId: string }> {
  const { supabase, input } = args;
  const { data, error } = await supabase.rpc("confirm_draft", {
    p_draft_id: input.draftId,
    p_title: input.title,
    p_topics: input.topics,
  });
  throwIfSupabaseError(error);

  return { sourceId: data };
}

// 대기 초안 목록(인박스) — 격리는 RLS(drafts_member_select)가 담당한다.
export async function listDrafts(args: {
  supabase: TypedSupabaseClient;
}): Promise<{ drafts: Draft[] }> {
  const { data, error } = await args.supabase
    .from("drafts")
    .select(DRAFT_COLUMNS)
    .order("created_at", { ascending: false });
  throwIfSupabaseError(error);

  return { drafts: (data ?? []).map(toDraft) };
}

export async function getDraft(args: {
  supabase: TypedSupabaseClient;
  draftId: string;
}): Promise<Draft> {
  const { data, error } = await args.supabase
    .from("drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", args.draftId)
    .single();
  throwIfSupabaseError(error);

  return toDraft(data);
}
