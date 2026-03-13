import type { SupabaseClient } from "@supabase/supabase-js";

export function trackEvent(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  sessionId: string | null,
  payload: Record<string, unknown> = {},
): void {
  supabase
    .from("events")
    .insert({ user_id: userId, session_id: sessionId, type, payload })
    .then(({ error }) => {
      if (error) {
        console.warn("[event-tracking] insert failed:", error.message);
      }
    });
}
