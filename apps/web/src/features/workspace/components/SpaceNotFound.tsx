import { useTranslation } from "@web/lib/tolgee";

// Space 목록 조회가 끝났는데 그 publicId가 없을 때 — 지워졌거나 잘못된 링크다.
export function SpaceNotFound() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-1 bg-surface-card px-6 text-center">
      <h1 className="text-lg font-semibold text-fg-primary">
        {t("space.not_found_title")}
      </h1>
      <p className="text-sm text-fg-tertiary">
        {t("space.not_found_description")}
      </p>
    </main>
  );
}
