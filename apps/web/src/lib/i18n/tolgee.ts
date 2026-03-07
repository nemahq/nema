import { Tolgee, FormatSimple } from "@tolgee/react";
import { getStorage } from "../storage.js";
import ko from "./ko.json";
import en from "./en.json";

const SUPPORTED_LANGUAGES = ["ko", "en"] as const;
const DEFAULT_LANGUAGE = "ko";

function detectLanguage(): string {
  const stored = getStorage("locale");
  if (stored) return stored;

  if (typeof navigator === "undefined" || !navigator.language) {
    return DEFAULT_LANGUAGE;
  }
  const browserLang = navigator.language.split("-")[0];
  if ((SUPPORTED_LANGUAGES as readonly string[]).includes(browserLang)) {
    return browserLang;
  }
  return DEFAULT_LANGUAGE;
}

export const tolgee = Tolgee().use(FormatSimple()).init({
  language: detectLanguage(),
  staticData: { ko, en },
});
