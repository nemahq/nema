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
  const { data: session, error: fetchError } = await supabase
    .from("sessions")
    .select("messages")
    .eq("id", input.sessionId)
    .single();

  if (fetchError) {
    throw new SupabaseError(
      fetchError.code === "PGRST116" ? "not_found" : "query_failed",
      fetchError.message,
      fetchError,
    );
  }

  const message: Message = {
    id: crypto.randomUUID(),
    role: "user",
    type: input.type,
    content: input.content,
    createdAt: new Date().toISOString(),
  };

  const messages = [...((session.messages ?? []) as Message[]), message];

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ messages })
    .eq("id", input.sessionId);

  if (updateError) {
    throw new SupabaseError("query_failed", updateError.message, updateError);
  }

  return message;
}
