import { PostHog } from "posthog-node";

import { getEnv } from "@server/env";

const DEFAULT_HOST = "https://us.i.posthog.com";
const FLUSH_BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 10_000;

let client: PostHog | null = null;
let initialized = false;

function getClient(): PostHog | null {
  if (initialized) {
    return client;
  }
  initialized = true;

  const env = getEnv();
  if (env.NODE_ENV !== "production") {
    return null;
  }

  const { POSTHOG_API_KEY, POSTHOG_HOST } = env;
  if (!POSTHOG_API_KEY) {
    return null;
  }

  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST ?? DEFAULT_HOST,
    flushAt: FLUSH_BATCH_SIZE,
    flushInterval: FLUSH_INTERVAL_MS,
  });

  return client;
}

export function capture(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): void {
  try {
    getClient()?.capture(args);
  } catch {
    // analytics must not affect app behavior
  }
}

export async function shutdown(): Promise<void> {
  try {
    await getClient()?.shutdown();
  } catch {
    // analytics must not affect app behavior
  }
}
