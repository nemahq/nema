import { NemaWordmark } from "@web/components/ui/NemaWordmark";
import { useTranslation } from "@web/lib/tolgee";

export function ComingSoonPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <NemaWordmark />
        <p className="text-fg-secondary">{t("coming_soon.subtitle")}</p>
      </div>
    </div>
  );
}
