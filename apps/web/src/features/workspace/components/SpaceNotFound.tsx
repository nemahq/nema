import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

// Space 목록 조회가 끝났는데 그 publicId가 없을 때 — 지워졌거나 잘못된 링크다.
export function SpaceNotFound() {
  const { t } = useTranslation();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-1 bg-surface-card px-6 text-center">
      <Text as="h1" size="lg" weight="semibold" color="primary">
        {t("space.not_found_title")}
      </Text>
      <Text size="sm" color="tertiary">
        {t("space.not_found_description")}
      </Text>
    </main>
  );
}
