import { NavigationBar } from "@web/components/layout/NavigationBar";
import { useTranslation } from "@web/lib/tolgee";

export function DraftsNavigationBar() {
  const { t } = useTranslation();

  return <NavigationBar items={[{ label: t("workspace.drafts") }]} />;
}
