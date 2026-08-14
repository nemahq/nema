import { NavigationBar } from "@web/components/layout/NavigationBar";
import { useTranslation } from "@web/lib/tolgee";

import { DigestListBody } from "./DigestListBody";

export function DigestListScreen() {
  const { t } = useTranslation();

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-surface-card">
      <NavigationBar items={[{ label: t("digest.nav_label") }]} />
      <DigestListBody />
    </main>
  );
}
