import { Tolgee, FormatSimple } from "@tolgee/react";
import type { Locale } from "./types.js";
import { getStorage } from "../storage.js";
import ko from "./ko.json";
import en from "./en.json";

function detectLanguage(): Locale {
  const stored = getStorage("locale");
  if (stored) return stored;

  const browserLang = navigator?.language?.split("-")[0];
  if (browserLang === "en") return "en";
  return "ko";
}

export const tolgee = Tolgee().use(FormatSimple()).init({
  language: detectLanguage(),
  staticData: { ko, en },
});
