import { ViewSegment } from "@web/features/memory/components/ViewSegment";
import { useAuth } from "@web/hooks/useAuth";
import { useTranslation } from "@web/lib/tolgee";
import { getDisplayName } from "@web/utils/user";

export function Header() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="flex min-h-12 items-center border-b border-border/50 px-6">
      <h1 className="text-base font-semibold">
        {t("memory.page_title", { name: getDisplayName(user) })}
      </h1>
      <div className="ml-3">
        <ViewSegment />
      </div>
    </div>
  );
}
