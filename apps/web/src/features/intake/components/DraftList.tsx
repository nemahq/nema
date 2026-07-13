import { Skeleton } from "@nema-io/weave";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import type { PendingSourceItem } from "@web/features/intake/types";
import { type DraftStatus, draftStatus } from "@web/features/intake/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DraftCard } from "./DraftCard";

const SKELETON_KEYS = ["skeleton-1", "skeleton-2", "skeleton-3"];

interface Draft {
  source: PendingSourceItem;
  status: DraftStatus;
}

function toDraft(source: PendingSourceItem): Draft | null {
  const status = draftStatus(source);
  return status === null ? null : { source, status };
}

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

  // 조회 실패는 "초안 없음"과 다른 상태다 — 같은 빈 화면으로 뭉개면 정말 비어 있는 건지
  // 목록을 못 불러온 건지 구분이 안 된다.
  if (pendingQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <NemaMarkIcon
          width={64}
          height={76}
          fill="currentColor"
          className="text-fg-primary opacity-[0.06] dark:opacity-[0.08]"
        />
        <p className="text-sm text-status-error">
          {getErrorMessage(pendingQuery.error)}
        </p>
      </div>
    );
  }

  const drafts = (pendingQuery.data?.items ?? [])
    .map(toDraft)
    .filter((draft): draft is Draft => draft !== null);

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
      {drafts.map(({ source, status }) => (
        <DraftCard
          key={source.sourceId}
          sourceId={source.sourceId}
          spaceId={source.spaceId}
          body={source.body}
          status={status}
          createdAt={source.createdAt}
        />
      ))}
    </div>
  );
}
