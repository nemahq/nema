import { useState } from "react";

import type { Locale } from "@nema-io/shared";

import { LegalLayout } from "@web/components/layout/LegalLayout";

import TermsEn from "./legal/terms.en.mdx";
import Terms from "./legal/terms.mdx";

export function TermsPage() {
  const [locale, setLocale] = useState<Locale>("ko");

  return (
    <LegalLayout locale={locale} onLocaleChange={setLocale}>
      {locale === "en" ? <TermsEn /> : <Terms />}
    </LegalLayout>
  );
}
