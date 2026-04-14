import { useTranslation } from "@web/lib/tolgee";

export function ViewSegment() {
  const { t } = useTranslation();

  return (
    <div className="flex overflow-hidden rounded-md border border-border/50">
      <button
        type="button"
        className="bg-fg-primary/15 px-3 py-1 text-xs font-semibold text-fg-primary"
      >
        {t("memory.view_overview")}
      </button>
      <button
        type="button"
        disabled
        className="border-l border-border/50 px-3 py-1 text-xs font-medium text-fg-tertiary opacity-50"
      >
        {t("memory.view_map")}
      </button>
    </div>
  );
}
