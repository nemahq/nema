import type { ContentLanguage, Profile } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase-error";

function toProfile(row: {
  content_language: string;
  created_at: string;
  updated_at: string;
}): Profile {
  return {
    contentLanguage: row.content_language as ContentLanguage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getProfile(
  supabase: TypedSupabaseClient,
  { userId }: { userId: string },
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("content_language, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  throwIfSupabaseError(error);

  return data ? toProfile(data) : null;
}

export async function upsertProfile(
  supabase: TypedSupabaseClient,
  {
    userId,
    contentLanguage,
  }: { userId: string; contentLanguage: ContentLanguage },
): Promise<Profile> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(
      { user_id: userId, content_language: contentLanguage },
      { onConflict: "user_id" },
    )
    .select("content_language, created_at, updated_at")
    .single();

  throwIfSupabaseError(error);

  return toProfile(data);
}
