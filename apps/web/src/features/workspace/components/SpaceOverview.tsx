import { useNavigate } from "@tanstack/react-router";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { NavigationBar } from "@web/components/layout/NavigationBar";
import { SourceComposer } from "@web/features/intake";
import { ChangesPanel } from "@web/features/review";
// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceTabButton } from "./SpaceTabButton";

// SpaceListItem 뱃지와 같은 조합(중립색·rounded-md). 내비게이션 바(작게)와
// 콘텐츠 헤더(크게) 둘 다 같은 조합을 쓰되 크기만 다르다.
const NAV_BADGE_CLASS =
  "flex size-6 shrink-0 items-center justify-center rounded-md bg-fg-primary/10 text-xs font-medium text-fg-primary";
const CONTENT_BADGE_CLASS =
  "flex size-8 shrink-0 items-center justify-center rounded-md bg-fg-primary/10 text-sm font-medium text-fg-primary";

export type SpaceTab = "topic" | "changesets";

interface SpaceOverviewProps {
  spacePublicId: string;
  activeTab: SpaceTab;
}

export function SpaceOverview({
  spacePublicId,
  activeTab,
}: SpaceOverviewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [spaceList] = useSpaceListSuspenseQuery();

  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );

  // 조회가 끝났는데 그 Space가 없으면(지워졌거나 잘못된 링크) 안내.
  if (!space) {
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
    <main className="flex flex-1 flex-col bg-surface-card">
      <NavigationBar>
        <div className="flex min-w-0 items-center gap-2">
          <span className={NAV_BADGE_CLASS}>
            {space.name.charAt(0).toUpperCase()}
          </span>
          <p className="min-w-0 truncate text-sm font-medium text-fg-primary">
            {space.name}
          </p>
        </div>
      </NavigationBar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className={CONTENT_BADGE_CLASS}>
              {space.name.charAt(0).toUpperCase()}
            </span>
            <h1 className="min-w-0 truncate text-xl font-semibold text-fg-primary">
              {space.name}
            </h1>
          </div>

          <div className="mt-4">
            <SourceComposer spaceId={space.id} />
          </div>

          <div className="mt-6 flex gap-1 border-b border-border/50">
            <SpaceTabButton
              active={activeTab === "topic"}
              onClick={() =>
                navigate({
                  to: "/space/$spacePublicId",
                  params: { spacePublicId },
                })
              }
            >
              {t("space.tab_topic")}
            </SpaceTabButton>
            <SpaceTabButton
              active={activeTab === "changesets"}
              onClick={() =>
                navigate({
                  to: "/space/$spacePublicId/changes",
                  params: { spacePublicId },
                })
              }
              count={space.openChangesetCount}
            >
              {t("space.tab_changesets")}
            </SpaceTabButton>
          </div>

          {activeTab === "changesets" && (
            <ErrorBoundary
              boundaryName="changes-panel"
              fallbackRender={(props) => <SectionErrorFallback {...props} />}
            >
              <ChangesPanel
                spaceId={space.id}
                onOpenReview={(changesetId) =>
                  navigate({
                    to: "/space/$spacePublicId/review/$changesetId",
                    params: { spacePublicId, changesetId },
                  })
                }
                onOpenDetail={(changesetId) =>
                  navigate({
                    to: "/space/$spacePublicId/changesets/$changesetId",
                    params: { spacePublicId, changesetId },
                  })
                }
              />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </main>
  );
}
