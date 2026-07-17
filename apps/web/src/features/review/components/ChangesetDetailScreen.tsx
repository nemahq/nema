import { Suspense, useState } from "react";
import { linkOptions, useNavigate } from "@tanstack/react-router";

import { Button } from "@nema-io/weave";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { RelativeTime } from "@web/components/ui/RelativeTime";
import { ChangesetStatusPill } from "@web/features/review/components/ChangesetStatusPill";
import { RevertChangesetDialog } from "@web/features/review/components/RevertChangesetDialog";
import { useChangesetListSuspenseQuery } from "@web/features/review/hooks/useChangesetListQuery";
import { useRevertChangeset } from "@web/features/review/hooks/useRevertChangeset";
import { changesetDisplayTitle } from "@web/features/review/utils";
import { SpaceBadge, useSpaceListSuspenseQuery } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetDetailScreenProps {
  spacePublicId: string;
  changesetId: string;
}

function ChangesetDetailNavSkeleton() {
  return <NavigationBar />;
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
  const navigate = useNavigate();
  const [changesetList] = useChangesetListSuspenseQuery(spaceId);
  const entry = changesetList.changesets.find((c) => c.id === changesetId);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const revertChangeset = useRevertChangeset();

  if (!entry) {
    return <ChangesetDetailNotFound />;
  }

  function handleConfirmRevert() {
    revertChangeset.mutate(
      { changesetId },
      {
        onSuccess: ({ revertChangesetId }) => {
          setRevertDialogOpen(false);
          navigate({
            to: "/space/$spacePublicId/changesets/$changesetId",
            params: { spacePublicId, changesetId: revertChangesetId },
          });
        },
      },
    );
  }

  return (
    <>
      <NavigationBar
        items={[
          {
            label: spaceName,
            icon: <SpaceBadge name={spaceName} size="sm" />,
            ...linkOptions({
              to: "/space/$spacePublicId",
              params: { spacePublicId },
            }),
          },
          {
            label: t("space.tab_changesets"),
            ...linkOptions({
              to: "/space/$spacePublicId/changes",
              params: { spacePublicId },
              search: { subTab: "open" },
            }),
          },
          { label: changesetDisplayTitle(entry, t) },
        ]}
      />

      <div data-main-scroll-area className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-6 py-6">
          <header className="sticky top-0 z-10 flex flex-col gap-2 bg-surface-card">
            <div className="flex items-center justify-between gap-4">
              <h1 className="flex min-w-0 items-baseline gap-2 text-2xl font-semibold text-fg-primary">
                <span className="min-w-0 truncate">
                  {changesetDisplayTitle(entry, t)}
                </span>
                <span className="shrink-0 text-lg font-normal text-fg-tertiary">
                  #{entry.number}
                </span>
              </h1>
              {entry.status === "applied" && (
                <Button
                  variant="neutral"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setRevertDialogOpen(true)}
                >
                  {t("review.detail_revert_action")}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ChangesetStatusPill status={entry.status} />
              <RelativeTime
                dateTime={entry.updatedAt}
                className="text-sm leading-none"
              />
            </div>
          </header>
        </div>
      </div>
      <RevertChangesetDialog
        open={revertDialogOpen}
        onOpenChange={setRevertDialogOpen}
        onConfirm={handleConfirmRevert}
        isPending={revertChangeset.isPending}
      />
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
