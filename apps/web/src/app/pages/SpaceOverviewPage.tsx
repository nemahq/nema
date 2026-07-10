import { useState } from "react";

import { cn, Skeleton } from "@nema-io/weave";

import { NemaMarkIcon } from "@web/components/ui/NemaMarkIcon";
import { useWorkspaceBootstrapQuery } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

interface SpaceOverviewPageProps {
  spaceId: string;
}

type SpaceTab = "thread" | "changesets";

const EMPTY_MESSAGE_KEY: Record<
  SpaceTab,
  "space.thread_empty" | "space.changesets_empty"
> = {
  thread: "space.thread_empty",
  changesets: "space.changesets_empty",
};

export function SpaceOverviewPage({ spaceId }: SpaceOverviewPageProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useWorkspaceBootstrapQuery();
  const [tab, setTab] = useState<SpaceTab>("thread");

  const space = data?.spaces.find((candidate) => candidate.id === spaceId);

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
            active={tab === "thread"}
            onClick={() => setTab("thread")}
          >
            {t("space.tab_thread")}
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

interface SpaceTabButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
}

function SpaceTabButton({ active, onClick, children }: SpaceTabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-fast",
        active
          ? "border-fg-primary font-medium text-fg-primary"
          : "border-transparent text-fg-tertiary hover:text-fg-secondary",
      )}
    >
      {children}
    </button>
  );
}

interface SpaceEmptyStateProps {
  message: string;
}

function SpaceEmptyState({ message }: SpaceEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <NemaMarkIcon
        width={64}
        height={76}
        fill="currentColor"
        className="text-fg-primary opacity-[0.06] dark:opacity-[0.08]"
      />
      <p className="text-sm text-fg-tertiary">{message}</p>
    </div>
  );
}
