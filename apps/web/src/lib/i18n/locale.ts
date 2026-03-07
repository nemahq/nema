import { tolgee } from "./tolgee.js";
import { setStorage } from "../storage.js";

export function changeLocale(locale: "ko" | "en") {
  setStorage("locale", locale);
  tolgee.changeLanguage(locale);
}
