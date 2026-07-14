import { Circle, Inbox } from "@nema-io/weave/icons";

import { Watermark } from "@web/components/ui/Watermark";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import type { PendingSourceItem } from "@web/features/intake/types";
import { type DraftStatus, draftStatus } from "@web/features/intake/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DraftCard } from "./DraftCard";
import { DraftSection } from "./DraftSection";

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
  // DraftsScreen이 이미 이 쿼리의 최초 로딩(isLoading)을 헤더까지 포함해 걸러주므로,
  // 여기서는 그 이후 상태(에러·빈 목록·목록)만 다루면 된다.
  const pendingQuery = usePendingSourceListQuery();

  // 조회 실패는 "초안 없음"과 다른 상태다 — 같은 빈 화면으로 뭉개면 정말 비어 있는 건지
  // 목록을 못 불러온 건지 구분이 안 된다.
  if (pendingQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
        <Watermark />
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
        <Watermark />
        <p className="text-sm text-fg-tertiary">{t("intake.drafts_empty")}</p>
      </div>
    );
  }

  // 사용자가 할 일이 있는지(재시도·삭제·이동 vs 그냥 대기)로 섹션을 나눈다.
  const waitingDrafts = drafts.filter(({ status }) => status !== "processing");
  const workingDrafts = drafts.filter(({ status }) => status === "processing");

  return (
    <div className="flex flex-col gap-6">
      <DraftSection
        label={t("intake.draft_section_waiting")}
        count={waitingDrafts.length}
        icon={<Inbox className="size-4 shrink-0 text-status-warning" />}
        tone="warning"
      >
        {waitingDrafts.map(({ source, status }) => (
          <DraftCard
            key={source.sourceId}
            sourceId={source.sourceId}
            spaceId={source.spaceId}
            title={source.title}
            body={source.body}
            status={status}
            createdAt={source.createdAt}
          />
        ))}
      </DraftSection>

      <DraftSection
        label={t("intake.draft_section_working")}
        count={workingDrafts.length}
        icon={
          <Circle className="size-2.5 shrink-0 fill-current text-fg-tertiary" />
        }
      >
        {workingDrafts.map(({ source, status }) => (
          <DraftCard
            key={source.sourceId}
            sourceId={source.sourceId}
            spaceId={source.spaceId}
            title={source.title}
            body={source.body}
            status={status}
            createdAt={source.createdAt}
          />
        ))}
      </DraftSection>
    </div>
  );
}
