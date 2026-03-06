import { Tolgee, DevTools, FormatSimple } from "@tolgee/react";

const SUPPORTED_LANGUAGES = ["ko", "en"] as const;
const DEFAULT_LANGUAGE = "ko";

function detectLanguage(): string {
  const browserLang = navigator.language.split("-")[0];
  if (
    SUPPORTED_LANGUAGES.includes(
      browserLang as (typeof SUPPORTED_LANGUAGES)[number],
    )
  ) {
    return browserLang;
  }
  return DEFAULT_LANGUAGE;
}

export const tolgee = Tolgee()
  .use(DevTools())
  .use(FormatSimple())
  .init({
    language: detectLanguage(),
    apiUrl: import.meta.env.VITE_TOLGEE_API_URL,
    apiKey: import.meta.env.VITE_TOLGEE_API_KEY,
  });
