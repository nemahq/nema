import { Text } from "@nema-io/weave";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { DigestListItem } from "@web/features/digest/components/DigestListItem";
import { DigestListSkeleton } from "@web/features/digest/components/DigestListSkeleton";
import { useDigestListQuery } from "@web/features/digest/hooks/useDigestListQuery";
import { useTranslation } from "@web/lib/tolgee";

export function DigestListPage() {
  const { t } = useTranslation();
  const { data, isPending } = useDigestListQuery();

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <NavigationBar items={[{ label: t("digest.nav_label") }]} />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-3 p-6">
          {isPending && <DigestListSkeleton />}
          {!isPending && data?.digests.length === 0 && (
            <Text as="p" size="sm" color="tertiary">
              {t("digest.list_empty")}
            </Text>
          )}
          {data?.digests.map((entry) => (
            <DigestListItem key={entry.id} entry={entry} />
          ))}
        </div>
      </div>
    </div>
  );
}
