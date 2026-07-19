import { useState } from "react";

import { DigestReviewCard } from "@web/features/dev-harness/components/DigestReviewCard";
import { usePendingSourceListQuery } from "@web/features/dev-harness/hooks/usePendingSourceListQuery";
import type { PendingSourceItem } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";

const DIGESTION_OUTCOME_LABEL: Record<
  PendingSourceItem["digestionOutcome"],
  string
> = {
  cancelled: "취소됨",
  failed: "생성 실패",
  discarded: "리뷰 버려짐",
  empty: "정리할 내용 없음",
  processing: "생성 중…",
};

function statusLabel(item: PendingSourceItem): string {
  if (item.reviewChangesetId) {
    return `리뷰 준비됨 · Digest ${item.digestCount}`;
  }
  return DIGESTION_OUTCOME_LABEL[item.digestionOutcome];
}

// 대기 원본(초안) — 그래프에 아직 안 들어간 것들. 리뷰가 열린 원본만 펼쳐 확정할 수 있다.
export function PendingSourceList() {
  const pendingQuery = usePendingSourceListQuery();
  const [openChangesetId, setOpenChangesetId] = useState<string | null>(null);

  const items = pendingQuery.data?.items ?? [];

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-fg-tertiary">
        초안 ({items.length})
      </h3>

      {pendingQuery.isError && (
        <p className="text-xs text-status-error">
          {getErrorMessage(pendingQuery.error)}
        </p>
      )}
      {!pendingQuery.isLoading && items.length === 0 && (
        <p className="text-xs text-fg-tertiary">
          비어 있음 — 위에서 원문을 던지면 여기로 떨어진다
        </p>
      )}

      <div className="flex max-h-96 flex-col gap-2 overflow-y-auto">
        {items.map((item) => {
          const canReview = item.reviewChangesetId !== null;
          const isOpen =
            canReview && openChangesetId === item.reviewChangesetId;
          return (
            <div
              key={item.sourceId}
              className="flex flex-col gap-1 rounded-lg border border-border/60 bg-surface-card p-2"
            >
              <button
                type="button"
                disabled={!canReview}
                onClick={() =>
                  setOpenChangesetId(isOpen ? null : item.reviewChangesetId)
                }
                className="flex items-center justify-between gap-2 text-left disabled:cursor-default"
              >
                <span className="text-xs text-fg-secondary">
                  {statusLabel(item)}
                </span>
                <span className="text-[10px] text-fg-tertiary">
                  {formatDateTime(item.createdAt)}
                </span>
              </button>

              {item.errorMessage && (
                <p className="text-xs text-status-error">{item.errorMessage}</p>
              )}
              {isOpen && item.reviewChangesetNumber !== null && (
                <DigestReviewCard
                  spaceId={item.spaceId}
                  number={item.reviewChangesetNumber}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
