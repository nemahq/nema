import { useState } from "react";

import { Skeleton } from "@nema-io/weave";

import { SourceComposer } from "@web/features/intake";
import { useSpaceList } from "@web/features/workspace/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceEmptyState } from "./SpaceEmptyState";
import { SpaceTabButton } from "./SpaceTabButton";

// SpaceListItem 뱃지와 같은 조합(중립색·rounded-md), 타이틀 크기(text-xl)에 맞춰 확대.
const TITLE_BADGE_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-md bg-fg-primary/10 text-sm font-medium text-fg-primary";

type SpaceTab = "topic" | "changesets";

interface SpaceOverviewProps {
  spacePublicId: string;
}

export function SpaceOverview({ spacePublicId }: SpaceOverviewProps) {
  const { t } = useTranslation();
  const { data: spaceList, isLoading } = useSpaceList();
  const [tab, setTab] = useState<SpaceTab>("topic");

  const space = spaceList?.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );

  // 조회가 끝났는데 그 Space가 없으면(지워졌거나 잘못된 링크) 무한 스켈레톤 대신 안내.
  if (!isLoading && !space) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-1 bg-surface-card px-6 text-center">
        <h1 className="text-lg font-semibold text-fg-primary">
          {t("space.not_found_title")}
        </h1>
        <p className="text-sm text-fg-tertiary">
          {t("space.not_found_description")}
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto bg-surface-card">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        {isLoading || !space ? (
          <div className="flex items-center gap-2">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-7 w-40" />
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <span className={TITLE_BADGE_CLASS}>
              {space.name.charAt(0).toUpperCase()}
            </span>
            <h1 className="min-w-0 truncate text-xl font-semibold text-fg-primary">
              {space.name}
            </h1>
          </div>
        )}

        <div className="mt-6">
          <SourceComposer spaceId={space?.id} />
        </div>

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
          <SpaceEmptyState />
        </div>
      </div>
    </main>
  );
}
