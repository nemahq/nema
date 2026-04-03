import type { SearchResultDoc } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

export async function createRetrieval({
  supabase,
  sessionId,
  query,
  body,
  documents,
}: {
  supabase: TypedSupabaseClient;
  sessionId: string;
  query: string;
  body: string;
  documents: SearchResultDoc[];
}): Promise<string> {
  const { data, error } = await supabase
    .from("session_retrievals")
    .insert({ session_id: sessionId, query, body, documents })
    .select("id")
    .single();

  throwIfSupabaseError(error);
  return data.id;
}

export async function deleteRetrieval({
  supabase,
  retrievalId,
}: {
  supabase: TypedSupabaseClient;
  retrievalId: string;
}): Promise<void> {
  const { error } = await supabase
    .from("session_retrievals")
    .delete()
    .eq("id", retrievalId);

  throwIfSupabaseError(error);
}
