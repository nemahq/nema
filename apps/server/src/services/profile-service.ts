import type { ContentLanguage, Profile } from "@nema-io/shared";
import { ProfileSchema } from "@nema-io/shared";

import type { Database } from "@server/infra/supabase/database.types";
import type { TypedSupabaseClient } from "@server/infra/supabase/supabase";
import { throwIfSupabaseError } from "@server/infra/supabase/supabase-error";

export async function getProfile(args: {
  supabase: TypedSupabaseClient;
  userId: string;
}): Promise<Profile | null> {
  const { supabase, userId } = args;

  const { data, error } = await supabase
    .from("profiles")
    .select("content_language, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  throwIfSupabaseError(error);

  return data ? toProfile(data) : null;
}

export async function upsertProfile(args: {
  supabase: TypedSupabaseClient;
  userId: string;
  contentLanguage: ContentLanguage;
}): Promise<Profile> {
  const { supabase, userId, contentLanguage } = args;

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

type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "content_language" | "created_at" | "updated_at"
>;

function toProfile(row: ProfileRow): Profile {
  return ProfileSchema.parse({
    contentLanguage: row.content_language,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}
