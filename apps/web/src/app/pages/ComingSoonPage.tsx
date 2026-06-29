import { useTranslation } from "@web/lib/tolgee";

export function ComingSoonPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <span className="text-[40px] font-bold leading-none tracking-tight text-teal-500 dark:text-fg-primary">
          Nema
        </span>
        <p className="text-fg-secondary">{t("coming_soon.subtitle")}</p>
      </div>
    </div>
  );
}
