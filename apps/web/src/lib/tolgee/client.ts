import { BackendFetch, FormatSimple, Tolgee } from "@tolgee/react";

import { getEnv } from "@web/app/env";
import { detectLanguage } from "@web/utils/locale";

const { TOLGEE_CDN_URL } = getEnv();
const tolgeeBuilder = Tolgee().use(FormatSimple());

// staging에서는 CDN URL을 설정하지 않음 — CDN은 main push 시에만 갱신되므로
// staging에서 CDN을 쓰면 오래된 번역이 로컬 JSON을 덮어쓴다
if (TOLGEE_CDN_URL) {
  tolgeeBuilder.use(
    BackendFetch({ prefix: TOLGEE_CDN_URL, fallbackOnFail: true }),
  );
}

export const tolgee = tolgeeBuilder.init({
  language: detectLanguage(),
  staticData: {
    ko: () => import("./ko.json").then((m) => m.default),
    en: () => import("./en.json").then((m) => m.default),
  },
});
