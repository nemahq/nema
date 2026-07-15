import { Circle, Inbox } from "@nema-io/weave/icons";

import { Watermark } from "@web/components/ui/Watermark";
import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import type {
  DraftCardData,
  PendingSourceItem,
} from "@web/features/intake/types";
import { type DraftStatus, draftStatus } from "@web/features/intake/utils";
import { getErrorMessage } from "@web/lib/getErrorMessage";
import { useTranslation } from "@web/lib/tolgee";

import { DraftSection } from "./DraftSection";
import { IdleDraftCard } from "./IdleDraftCard";
import { WorkingDraftCard } from "./WorkingDraftCard";

interface Draft {
  source: PendingSourceItem;
  status: DraftStatus;
}

function toDraft(source: PendingSourceItem): Draft | null {
  const status = draftStatus(source);
  return status === null ? null : { source, status };
}

interface DraftListProps {
  onSelectSource: (draft: DraftCardData) => void;
  // 결과없음 카드의 상태 아이콘 표시 여부에 쓰는, 현재 상세에서 편집 중인 sourceId.
  editedDraftId: string | null;
}

export function DraftList({ onSelectSource, editedDraftId }: DraftListProps) {
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
    <div className="flex flex-col">
      <DraftSection
        label={t("intake.draft_section_waiting")}
        count={waitingDrafts.length}
        icon={<Inbox className="size-4 shrink-0 text-status-warning" />}
        tone="warning"
      >
        {waitingDrafts.map(({ source, status }) => {
          const draft: DraftCardData = {
            sourceId: source.sourceId,
            spaceId: source.spaceId,
            title: source.title,
            body: source.body,
            status,
            createdAt: source.createdAt,
          };
          return (
            <IdleDraftCard
              key={source.sourceId}
              sourceId={draft.sourceId}
              spaceId={draft.spaceId}
              title={draft.title}
              body={draft.body}
              status={draft.status}
              createdAt={draft.createdAt}
              isEdited={source.sourceId === editedDraftId}
              onSelect={() => onSelectSource(draft)}
            />
          );
        })}
      </DraftSection>

      <DraftSection
        label={t("intake.draft_section_working")}
        count={workingDrafts.length}
        icon={
          <Circle className="size-2.5 shrink-0 animate-pulse fill-current text-fg-tertiary" />
        }
      >
        {workingDrafts.map(({ source, status }) => {
          const draft: DraftCardData = {
            sourceId: source.sourceId,
            spaceId: source.spaceId,
            title: source.title,
            body: source.body,
            status,
            createdAt: source.createdAt,
          };
          return (
            <WorkingDraftCard
              key={source.sourceId}
              sourceId={draft.sourceId}
              spaceId={draft.spaceId}
              title={draft.title}
              body={draft.body}
              status={draft.status}
              createdAt={draft.createdAt}
              onSelect={() => onSelectSource(draft)}
            />
          );
        })}
      </DraftSection>
    </div>
  );
}
