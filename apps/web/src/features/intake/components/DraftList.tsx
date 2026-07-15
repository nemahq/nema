import { Circle, CircleCheck, Inbox } from "@nema-io/weave/icons";

import { usePendingSourceListQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import type { PendingSourceItem } from "@web/features/intake/types";
import { type DraftStatus, draftStatus } from "@web/features/intake/utils";
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
  // DraftsScreen이 선택된 초안을 폴링되는 최신 쿼리 데이터에서 직접 다시 찾아
  // 쓰므로, 여기서는 어떤 draft를 골랐는지가 아니라 어떤 sourceId를 골랐는지만
  // 알리면 된다.
  onSelectSource: (sourceId: string) => void;
  // 결과없음 카드의 상태 아이콘 표시 여부에 쓰는, 현재 상세에서 편집 중인 sourceId.
  editedDraftId: string | null;
}

export function DraftList({ onSelectSource, editedDraftId }: DraftListProps) {
  const { t } = useTranslation();
  // DraftsScreen이 이미 이 쿼리의 최초 로딩(isLoading)을 헤더까지 포함해 걸러주므로,
  // 여기서는 그 이후 상태(에러·빈 목록·목록)만 다루면 된다.
  const pendingQuery = usePendingSourceListQuery();

  // 이 쿼리가 이 화면 콘텐츠 전체의 존재 이유라 부분 격리할 이유가 없다 — 그냥 던져서
  // draftsRoute의 RouteErrorFallback이 잡게 한다(컨벤션 기본값: 쿼리 에러는 라우트
  // errorComponent가 처리).
  if (pendingQuery.isError) {
    throw pendingQuery.error;
  }

  const drafts = (pendingQuery.data?.items ?? [])
    .map(toDraft)
    .filter((draft): draft is Draft => draft !== null);

  if (drafts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <CircleCheck className="size-12 text-fg-tertiary" strokeWidth={1.5} />
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
        {waitingDrafts.map(({ source, status }) => (
          <IdleDraftCard
            key={source.sourceId}
            sourceId={source.sourceId}
            spaceId={source.spaceId}
            title={source.title}
            body={source.body}
            status={status}
            createdAt={source.createdAt}
            isEdited={source.sourceId === editedDraftId}
            onSelect={() => onSelectSource(source.sourceId)}
          />
        ))}
      </DraftSection>

      <DraftSection
        label={t("intake.draft_section_organizing")}
        count={workingDrafts.length}
        icon={
          <Circle className="size-2.5 shrink-0 animate-pulse fill-current text-fg-tertiary" />
        }
      >
        {workingDrafts.map(({ source, status }) => (
          <WorkingDraftCard
            key={source.sourceId}
            sourceId={source.sourceId}
            spaceId={source.spaceId}
            title={source.title}
            body={source.body}
            status={status}
            createdAt={source.createdAt}
            onSelect={() => onSelectSource(source.sourceId)}
          />
        ))}
      </DraftSection>
    </div>
  );
}
