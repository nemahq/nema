import posthogLib from "posthog-js";

import { getEnv } from "@web/app/env";

const DEFAULT_HOST = "https://us.i.posthog.com";

const { APP_ENV, POSTHOG_KEY, POSTHOG_HOST } = getEnv();

if (POSTHOG_KEY && APP_ENV === "production") {
  posthogLib.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST ?? DEFAULT_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
  });
}

export const posthog = {
  capture: (...args: Parameters<typeof posthogLib.capture>) => {
    try {
      posthogLib.capture(...args);
    } catch {
      // analytics must not affect app behavior
    }
  },
  identify: (...args: Parameters<typeof posthogLib.identify>) => {
    try {
      posthogLib.identify(...args);
    } catch {
      // analytics must not affect app behavior
    }
  },
  reset: () => {
    try {
      posthogLib.reset();
    } catch {
      // analytics must not affect app behavior
    }
  },
};
