import { Text } from "@nema-io/weave";
import { CircleCheck } from "@nema-io/weave/icons";

// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { useSourceDraftListSuspenseQuery } from "@web/features/drafts/hooks/useSourceDraftListQuery";
import { useTranslation } from "@web/lib/tolgee";

import { DraftCard } from "./DraftCard";

interface DraftListProps {
  onSelectSource: (sourceId: string) => void;
}

export function DraftList({ onSelectSource }: DraftListProps) {
  const { t } = useTranslation();
  const [drafts] = useSourceDraftListSuspenseQuery();

  if (drafts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <CircleCheck className="size-12 text-fg-tertiary" strokeWidth={1.5} />
        <Text size="sm" color="tertiary">
          {t("draft.empty_state")}
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {drafts.map((draft) => (
        <DraftCard
          key={draft.sourceId}
          sourceId={draft.sourceId}
          name={draft.name}
          createdAt={draft.createdAt}
          status={draft.status}
          onSelect={onSelectSource}
        />
      ))}
    </div>
  );
}
