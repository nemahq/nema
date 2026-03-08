// eslint-disable-next-line no-restricted-imports
import { useTranslate } from "@tolgee/react";
import type { CombinedOptions, DefaultParamType } from "@tolgee/web";

import type { TranslationKey } from "./types.js";

export function useTranslation() {
  const { t: tolgeeT } = useTranslate();
  return {
    t: (key: TranslationKey, options?: CombinedOptions<DefaultParamType>) =>
      tolgeeT(key, options),
  };
}
