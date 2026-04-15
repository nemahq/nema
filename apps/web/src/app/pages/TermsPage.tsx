import { LegalLayout } from "@web/components/layout/LegalLayout";
import { useCurrentLocale } from "@web/lib/tolgee/useCurrentLocale";

import TermsEn from "./legal/terms.en.mdx";
import Terms from "./legal/terms.mdx";

export function TermsPage() {
  const locale = useCurrentLocale();

  return <LegalLayout>{locale === "en" ? <TermsEn /> : <Terms />}</LegalLayout>;
}
