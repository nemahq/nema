import { PostHog } from "posthog-node";

import { getEnv } from "@server/env";

const DEFAULT_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;
let initialized = false;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

function getClient(): PostHog | null {
  if (initialized) {
    return client;
  }
  initialized = true;

  if (!IS_PRODUCTION) {
    return null;
  }

  const { POSTHOG_API_KEY, POSTHOG_HOST } = getEnv();
  if (!POSTHOG_API_KEY) {
    return null;
  }

  client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST ?? DEFAULT_HOST,
    flushAt: 20,
    flushInterval: 10_000,
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
