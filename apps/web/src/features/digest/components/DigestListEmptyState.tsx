import { Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

export function DigestListEmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-24">
      <Text size="sm" color="secondary">
        {t("digest.list_empty_title")}
      </Text>
      <Text size="sm" color="tertiary">
        {t("digest.list_empty_description")}
      </Text>
    </div>
  );
}
