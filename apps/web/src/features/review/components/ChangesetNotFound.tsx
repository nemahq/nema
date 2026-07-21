import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

export function ChangesetNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <Text as="h1" size="lg" bold>
        {t("review.detail_not_found_title")}
      </Text>
      <Text size="sm" color="tertiary">
        {t("review.detail_not_found_description")}
      </Text>
    </div>
  );
}
