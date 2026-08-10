import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { mergeConfig } from "vitest/config";

import baseConfig from "../../vitest.config.base";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@web": resolve(__dirname, "src"),
    },
  },
});
