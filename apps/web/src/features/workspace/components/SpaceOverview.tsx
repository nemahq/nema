import { useState } from "react";

import { Skeleton } from "@nema-io/weave";

import { useWorkspaceBootstrapQuery } from "@web/features/workspace/hooks/useWorkspaceBootstrapQuery";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceEmptyState } from "./SpaceEmptyState";
import { SpaceTabButton } from "./SpaceTabButton";

type SpaceTab = "topic" | "changesets";

const EMPTY_MESSAGE_KEY: Record<
  SpaceTab,
  "space.topic_empty" | "space.changesets_empty"
> = {
  topic: "space.topic_empty",
  changesets: "space.changesets_empty",
};

interface SpaceOverviewProps {
  spaceId: string;
}

export function SpaceOverview({ spaceId }: SpaceOverviewProps) {
  const { t } = useTranslation();
  const { data: bootstrap, isLoading } = useWorkspaceBootstrapQuery();
  const [tab, setTab] = useState<SpaceTab>("topic");

  const space = bootstrap?.spaces.find((candidate) => candidate.id === spaceId);

  // 조회가 끝났는데 그 Space가 없으면(지워졌거나 잘못된 링크) 무한 스켈레톤 대신 안내.
  if (!isLoading && !space) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-surface-card px-6">
        <SpaceEmptyState message={t("space.not_found")} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        {isLoading || !space ? (
          <Skeleton className="h-7 w-40" />
        ) : (
          <h1 className="text-xl font-semibold text-fg-primary">
            {space.name}
          </h1>
        )}

        <div className="mt-6 flex gap-1 border-b border-border/50">
          <SpaceTabButton
            active={tab === "topic"}
            onClick={() => setTab("topic")}
          >
            {t("space.tab_topic")}
          </SpaceTabButton>
          <SpaceTabButton
            active={tab === "changesets"}
            onClick={() => setTab("changesets")}
          >
            {t("space.tab_changesets")}
          </SpaceTabButton>
        </div>

        <div className="flex flex-1 items-center justify-center py-16">
          <SpaceEmptyState message={t(EMPTY_MESSAGE_KEY[tab])} />
        </div>
      </div>
    </main>
  );
}
