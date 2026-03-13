import { PostHog } from "posthog-node";

import { getEnv } from "@server/env";

const DEFAULT_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;

export function getPostHog(): PostHog | null {
  if (client) {
    return client;
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
