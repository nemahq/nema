import { linkOptions, useNavigate } from "@tanstack/react-router";

import { ErrorBoundary } from "@web/app/error/ErrorBoundary";
import { SectionErrorFallback } from "@web/app/error/SectionErrorFallback";
import { NavigationBar } from "@web/components/layout/NavigationBar";
import { SourceComposer } from "@web/features/intake";
import { ChangesPanel, type ChangesSubTab } from "@web/features/review";
import { useMainScrollRestoration } from "@web/features/workspace/hooks/useMainScrollRestoration";
// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

import { SpaceBadge } from "./SpaceBadge";
import { SpaceTabButton } from "./SpaceTabButton";

export type SpaceOverviewProps = { spacePublicId: string } & (
  | { activeTab: "topic" }
  | {
      activeTab: "changesets";
      subTab: ChangesSubTab;
      onSubTabChange: (subTab: ChangesSubTab) => void;
    }
);

export function SpaceOverview(props: SpaceOverviewProps) {
  const { spacePublicId, activeTab } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [spaceList] = useSpaceListSuspenseQuery();
  // Open/Closed는 같은 라우트 안 search param 전환이라 컨테이너가 언마운트되지
  // 않는다 — subTab을 key에 포함해야 서브탭끼리도 독립된 스크롤 위치를 갖는다.
  const scrollKey =
    props.activeTab === "changesets"
      ? `${spacePublicId}:changesets:${props.subTab}`
      : `${spacePublicId}:topic`;
  const scrollContainerRef = useMainScrollRestoration(scrollKey);

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
      <NavigationBar
        items={
          activeTab === "topic"
            ? [
                {
                  label: space.name,
                  icon: <SpaceBadge name={space.name} size="sm" />,
                },
              ]
            : [
                {
                  label: space.name,
                  icon: <SpaceBadge name={space.name} size="sm" />,
                  ...linkOptions({
                    to: "/space/$spacePublicId",
                    params: { spacePublicId },
                  }),
                },
                { label: t("space.tab_changesets") },
              ]
        }
      />

      <div
        ref={scrollContainerRef}
        data-main-scroll-area
        className="flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
          <div className="flex min-w-0 items-center gap-2">
            <SpaceBadge name={space.name} />
            <h1 className="min-w-0 truncate text-2xl font-semibold text-fg-primary">
              {space.name}
            </h1>
          </div>

          <div className="mt-4">
            <SourceComposer spaceId={space.id} />
          </div>

          {/* 탭만 sticky — 스크롤 중 자연스러운 위치가 top:0(네비게이션 바 바로
              아래)에 닿는 순간부터만 고정된다(sticky의 기본 동작), 그 전까진
              컴포저·제목과 함께 평소처럼 스크롤된다. */}
          <div className="sticky top-0 z-10 mt-6 flex gap-1 border-b border-border/50 bg-surface-card">
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
                  to: "/space/$spacePublicId/changesets",
                  params: { spacePublicId },
                  search: { subTab: "open" },
                })
              }
              count={space.openChangesetCount}
            >
              {t("space.tab_changesets")}
            </SpaceTabButton>
          </div>

          {props.activeTab === "changesets" && (
            <ErrorBoundary
              boundaryName="changes-panel"
              fallbackRender={(fallbackProps) => (
                <SectionErrorFallback {...fallbackProps} />
              )}
            >
              <ChangesPanel
                spacePublicId={spacePublicId}
                spaceId={space.id}
                subTab={props.subTab}
                onSubTabChange={props.onSubTabChange}
              />
            </ErrorBoundary>
          )}
        </div>
      </div>
    </main>
  );
}
