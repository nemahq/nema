import type { Message, SendMessageInput } from "@nema-io/shared";
import { MessageSchema } from "@nema-io/shared";

import type { TypedSupabaseClient } from "@server/infra/supabase";
import {
  SupabaseError,
  toSupabaseErrorCode,
} from "@server/infra/supabase-error";

export async function getMessages(
  supabase: TypedSupabaseClient,
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
  supabase: TypedSupabaseClient,
  input: SendMessageInput,
): Promise<Message> {
  const message = MessageSchema.parse({
    id: crypto.randomUUID(),
    role: "user",
    type: input.type,
    content: input.content,
    createdAt: new Date().toISOString(),
  });

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
