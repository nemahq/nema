import posthog from "posthog-js";

import { getEnv } from "@web/app/env";

const DEFAULT_HOST = "https://us.i.posthog.com";

const { POSTHOG_KEY, POSTHOG_HOST } = getEnv();

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST ?? DEFAULT_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
  });
}

export { posthog };
