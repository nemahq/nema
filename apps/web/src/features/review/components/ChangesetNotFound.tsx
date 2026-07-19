import { useTranslation } from "@web/lib/tolgee";

export function ChangesetNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <h1 className="text-lg font-semibold text-fg-primary">
        {t("review.detail_not_found_title")}
      </h1>
      <p className="text-sm text-fg-tertiary">
        {t("review.detail_not_found_description")}
      </p>
    </div>
  );
}
