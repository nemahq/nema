import type { SupabaseClient } from "@supabase/supabase-js";

import type { Message, SendMessageInput } from "@nema-io/shared";

import { SupabaseError } from "@server/infra/supabase-error";

export async function getMessages(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select("messages")
    .eq("id", sessionId)
    .single();

  if (error) {
    throw new SupabaseError(
      error.code === "PGRST116" ? "not_found" : "query_failed",
      error.message,
      error,
    );
  }

  return (data.messages ?? []) as Message[];
}

export async function sendMessage(
  supabase: SupabaseClient,
  input: SendMessageInput,
): Promise<Message> {
  const message: Message = {
    id: crypto.randomUUID(),
    role: "user",
    type: input.type,
    content: input.content,
    createdAt: new Date().toISOString(),
  };

  const { error } = await supabase.rpc("append_message", {
    p_session_id: input.sessionId,
    p_message: message,
  });

  if (error) {
    throw new SupabaseError(
      error.code === "P0002" ? "not_found" : "query_failed",
      error.message,
      error,
    );
  }

  return message;
}
