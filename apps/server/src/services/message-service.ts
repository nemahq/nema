import type { SupabaseClient } from "@supabase/supabase-js";

import type { Message, SendMessageInput } from "@nema-io/shared";
import { MessageSchema } from "@nema-io/shared";

import {
  SupabaseError,
  toSupabaseErrorCode,
} from "@server/infra/supabase-error";

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
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }

  return MessageSchema.array().parse(data.messages ?? []);
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
      toSupabaseErrorCode(error.code),
      error.message,
      error,
    );
  }

  return message;
}
