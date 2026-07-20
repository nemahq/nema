import { Circle, CircleCheck, Inbox } from "@nema-io/weave/icons";

// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { usePendingSourceListSuspenseQuery } from "@web/features/intake/hooks/usePendingSourceListQuery";
import { isWaitingDraft, toDrafts } from "@web/features/intake/utils";
import { useTranslation } from "@web/lib/tolgee";

import { DraftSection } from "./DraftSection";
import { IdleDraftCard } from "./IdleDraftCard";
import { WorkingDraftCard } from "./WorkingDraftCard";

const WAITING_ICON = <Inbox className="size-4 shrink-0 text-status-warning" />;
const ORGANIZING_ICON = (
  <Circle className="size-2.5 shrink-0 animate-pulse fill-current text-status-info" />
);

interface DraftListProps {
  // 카드가 memo라 이 참조가 안정적이어야 의미가 있다 — 여기서 인라인 화살표
  // (onSelect={() => onSelectSource(id)})로 감싸면 매 렌더 새 함수가 되어
  // Realtime invalidate마다 카드 전체가 다시 그려진다. 카드가 sourceId를 받아
  // 스스로 넘기는 건 그래서다.
  onSelectSource: (sourceId: string) => void;
}

export function DraftList({ onSelectSource }: DraftListProps) {
  const { t } = useTranslation();
  // 로딩은 메인 영역 Outlet Suspense(워터마크)로, 에러는 draftsRoute errorComponent로
  // 자동 위임된다 — 이 쿼리가 화면 콘텐츠 전체의 존재 이유라 부분 격리하지 않는다.
  const [pendingSources] = usePendingSourceListSuspenseQuery();

  const drafts = toDrafts(pendingSources.items);

  if (drafts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <CircleCheck className="size-12 text-fg-tertiary" strokeWidth={1.5} />
        <p className="text-sm text-fg-tertiary">{t("intake.drafts_empty")}</p>
      </div>
    );
  }

  const waitingDrafts = drafts.filter(isWaitingDraft);
  const workingDrafts = drafts.filter((draft) => !isWaitingDraft(draft));

  return (
    <div className="flex flex-col">
      <DraftSection
        label={t("intake.draft_section_waiting")}
        count={waitingDrafts.length}
        icon={WAITING_ICON}
        tone="warning"
      >
        {waitingDrafts.map(({ source, status }) => (
          <IdleDraftCard
            key={source.sourceId}
            sourceId={source.sourceId}
            title={source.title}
            body={source.body}
            status={status}
            createdAt={source.createdAt}
            inputChangedSinceDigestion={source.inputChangedSinceDigestion}
            onSelect={onSelectSource}
          />
        ))}
      </DraftSection>

      <DraftSection
        label={t("intake.draft_section_organizing")}
        count={workingDrafts.length}
        icon={ORGANIZING_ICON}
        tone="info"
      >
        {workingDrafts.map(({ source }) => (
          <WorkingDraftCard
            key={source.sourceId}
            sourceId={source.sourceId}
            title={source.title}
            body={source.body}
            createdAt={source.createdAt}
            onSelect={onSelectSource}
          />
        ))}
      </DraftSection>
    </div>
  );
}
