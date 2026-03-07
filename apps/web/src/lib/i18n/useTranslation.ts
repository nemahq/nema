import { useTranslate } from "@tolgee/react";
import type { TranslationKey } from "./types.js";

export function useTranslation() {
  const { t: tolgeeT } = useTranslate();

  const t = (key: TranslationKey) => tolgeeT(key);

  return { t };
}
