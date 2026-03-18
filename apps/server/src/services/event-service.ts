import * as Sentry from "@sentry/node";

import type { Json } from "@server/infra/database.types";
import { capture as capturePostHog } from "@server/infra/posthog";
import type { TypedSupabaseClient } from "@server/infra/supabase";

type ServerEventMap = {
  "mode.selected": { mode: string };
  "document.saved": { doc_count: number };
  "retrieval.completed": { result_count: number };
};

type JsonRecord = { [key: string]: Json | undefined };

interface TrackEventParams<
  T extends string = string,
  P extends JsonRecord = JsonRecord,
> {
  supabase: TypedSupabaseClient;
  userId: string;
  type: T;
  sessionId: string | null;
  payload: P;
}

export function trackEvent<T extends keyof ServerEventMap>(
  params: TrackEventParams<T, ServerEventMap[T]>,
): void;
export function trackEvent(params: TrackEventParams): void;
export function trackEvent({
  supabase,
  userId,
  type,
  sessionId,
  payload = {},
}: TrackEventParams): void {
  const properties = { session_id: sessionId, ...payload };

  capturePostHog({ distinctId: userId, event: type, properties });

  void (async () => {
    try {
      const { error } = await supabase.from("events").insert({
        user_id: userId,
        session_id: sessionId,
        type,
        payload,
      });
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
