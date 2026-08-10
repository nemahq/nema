import { useState } from "react";

import type { Locale } from "@nema-io/shared";

import { LegalLayout } from "@web/components/layout/LegalLayout";

import PrivacyEn from "./legal/privacy.en.mdx";
import Privacy from "./legal/privacy.mdx";

export function PrivacyPage() {
  const [locale, setLocale] = useState<Locale>("ko");

  return (
    <LegalLayout locale={locale} onLocaleChange={setLocale}>
      {locale === "en" ? <PrivacyEn /> : <Privacy />}
    </LegalLayout>
  );
}
