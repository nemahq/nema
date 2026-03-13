import * as Sentry from "@sentry/node";
import type { SupabaseClient } from "@supabase/supabase-js";

import { capture as capturePostHog } from "@server/infra/posthog";

type ServerEventMap = {
  "intent.classified": { intent: string };
  "document.saved": { doc_count: number };
  "retrieval.completed": { result_count: number };
};

export function trackEvent<T extends keyof ServerEventMap>(
  supabase: SupabaseClient,
  userId: string,
  type: T,
  sessionId: string | null,
  payload: ServerEventMap[T],
): void;
export function trackEvent(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  sessionId: string | null,
  payload: Record<string, unknown>,
): void;
export function trackEvent(
  supabase: SupabaseClient,
  userId: string,
  type: string,
  sessionId: string | null,
  payload: Record<string, unknown> = {},
): void {
  const properties = { session_id: sessionId, ...payload };

  capturePostHog({ distinctId: userId, event: type, properties });

  void (async () => {
    try {
      const { error } = await supabase
        .from("events")
        .insert({ user_id: userId, session_id: sessionId, type, payload });
      if (error) {
        Sentry.captureMessage(
          `[event-tracking] insert failed: ${error.message}`,
          { level: "warning", extra: { type, sessionId } },
        );
      }
    } catch (err) {
      Sentry.captureException(err);
    }
  })();
}
