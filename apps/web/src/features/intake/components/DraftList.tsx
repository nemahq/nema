import { Skeleton } from "@nema-io/weave";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { draftStatus, isDraftItem } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

import { DraftCard } from "./DraftCard";

const SKELETON_KEYS = ["skeleton-1", "skeleton-2", "skeleton-3"];

export function DraftList() {
  const { t } = useTranslation();
  const pendingQuery = usePendingSourceListQuery();

  if (pendingQuery.isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {SKELETON_KEYS.map((key) => (
          <Skeleton key={key} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const drafts = (pendingQuery.data?.items ?? []).filter(isDraftItem);

  if (drafts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <NemaMarkIcon
          width={64}
          height={76}
          fill="currentColor"
          className="text-fg-primary opacity-[0.06] dark:opacity-[0.08]"
        />
        <p className="text-sm text-fg-tertiary">{t("intake.drafts_empty")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((item) => (
        <DraftCard
          key={item.sourceId}
          body={item.body}
          status={draftStatus(item)}
          createdAt={item.createdAt}
        />
      ))}
    </div>
  );
}
