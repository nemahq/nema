import { LegalLayout } from "@web/components/layout/LegalLayout";
import { useCurrentLocale } from "@web/lib/tolgee/useCurrentLocale";

import PrivacyEn from "./legal/privacy.en.mdx";
import Privacy from "./legal/privacy.mdx";

export function PrivacyPage() {
  const locale = useCurrentLocale();

  return (
    <LegalLayout>{locale === "en" ? <PrivacyEn /> : <Privacy />}</LegalLayout>
  );
}
