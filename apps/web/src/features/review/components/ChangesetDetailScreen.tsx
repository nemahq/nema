import { Suspense } from "react";
import { Link } from "@tanstack/react-router";

import { Skeleton } from "@nema-io/weave";
import { ChevronRight } from "@nema-io/weave/icons";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { useChangesetListSuspenseQuery } from "@web/features/review/hooks/useChangesetListQuery";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { SpaceBadge } from "@web/features/workspace";
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetDetailScreenProps {
  spacePublicId: string;
  changesetId: string;
}

function ChangesetDetailNavSkeleton() {
  return (
    <NavigationBar>
      <Skeleton className="h-4 w-56" />
    </NavigationBar>
  );
}

function ChangesetDetailNotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <h1 className="text-lg font-semibold text-fg-primary">
        {t("review.detail_not_found_title")}
      </h1>
      <p className="text-sm text-fg-tertiary">
        {t("review.detail_not_found_description")}
      </p>
    </div>
  );
}

interface ChangesetDetailBodyProps {
  spacePublicId: string;
  spaceId: string;
  spaceName: string;
  changesetId: string;
}

// space가 해석된 뒤에만 마운트된다(ChangesetDetailSpaceGate 참고) — changesetList
// suspense query가 spaceId를 필수 인자로 받아야 해서, 이 단계가 분리돼 있다.
function ChangesetDetailBody({
  spacePublicId,
  spaceId,
  spaceName,
  changesetId,
}: ChangesetDetailBodyProps) {
  const { t } = useTranslation();
  const [changesetList] = useChangesetListSuspenseQuery(spaceId);
  const entry = changesetList.changesets.find((c) => c.id === changesetId);

  if (!entry) {
    return <ChangesetDetailNotFound />;
  }

  return (
    <>
      <NavigationBar>
        <div className="flex min-w-0 items-center gap-1.5 text-fg-primary">
          <Link
            to="/space/$spacePublicId"
            params={{ spacePublicId }}
            className="flex min-w-0 shrink items-center gap-1.5"
          >
            <SpaceBadge name={spaceName} size="sm" />
            <span className="min-w-0 max-w-48 truncate">{spaceName}</span>
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-fg-tertiary/60" />
          <Link
            to="/space/$spacePublicId/changes"
            params={{ spacePublicId }}
            search={{ subTab: "open" }}
            className="shrink-0"
          >
            {t("space.tab_changesets")}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-fg-tertiary/60" />
          <span className="min-w-0 max-w-96 truncate">
            {changesetDisplayTitle(entry, t)}
          </span>
        </div>
      </NavigationBar>

      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8" />
      </div>
    </>
  );
}

function ChangesetDetailSpaceGate({
  spacePublicId,
  changesetId,
}: ChangesetDetailScreenProps) {
  const [spaceList] = useSpaceListSuspenseQuery();
  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );

  if (!space) {
    return <ChangesetDetailNotFound />;
  }

  return (
    <Suspense fallback={<ChangesetDetailNavSkeleton />}>
      <ChangesetDetailBody
        spacePublicId={spacePublicId}
        spaceId={space.id}
        spaceName={space.name}
        changesetId={changesetId}
      />
    </Suspense>
  );
}

export function ChangesetDetailScreen({
  spacePublicId,
  changesetId,
}: ChangesetDetailScreenProps) {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <Suspense fallback={<ChangesetDetailNavSkeleton />}>
        <ChangesetDetailSpaceGate
          spacePublicId={spacePublicId}
          changesetId={changesetId}
        />
      </Suspense>
    </main>
  );
}
