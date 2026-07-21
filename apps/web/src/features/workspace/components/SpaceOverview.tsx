import { Text } from "@nema-io/weave";

import { SourceComposer } from "@web/features/intake";
import type { ChangesSubTab } from "@web/features/review";
import { useMainScrollRestoration } from "@web/features/workspace/hooks/useMainScrollRestoration";
// 로딩은 공용 <Outlet> Suspense(ContentAreaFallback 워터마크)에 위임 — 로컬 경계 불필요.
// eslint-disable-next-line nema/require-suspense-boundary
import { useSpaceListSuspenseQuery } from "@web/features/workspace/hooks/useSpaceList";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetsTab } from "./ChangesetsTab";
import { SpaceBadge } from "./SpaceBadge";
import { SpaceNavigationBar } from "./SpaceNavigationBar";
import { SpaceNotFound } from "./SpaceNotFound";
import { SpaceTabs } from "./SpaceTabs";

export type SpaceOverviewProps = { spacePublicId: string } & (
  | { activeTab: "topic" }
  | {
      activeTab: "changesets";
      subTab: ChangesSubTab;
      onSubTabChange: (subTab: ChangesSubTab) => void;
    }
);

// Open/Closed는 같은 라우트 안 search param 전환이라 컨테이너가 언마운트되지
// 않는다 — subTab을 key에 포함해야 서브탭끼리도 독립된 스크롤 위치를 갖는다.
function scrollKeyOf(props: SpaceOverviewProps): string {
  return props.activeTab === "changesets"
    ? `${props.spacePublicId}:changesets:${props.subTab}`
    : `${props.spacePublicId}:topic`;
}

export function SpaceOverview(props: SpaceOverviewProps) {
  const { spacePublicId, activeTab } = props;
  const { t } = useTranslation();
  const [spaceList] = useSpaceListSuspenseQuery();
  const scrollContainerRef = useMainScrollRestoration(scrollKeyOf(props));

  const space = spaceList.spaces.find(
    (candidate) => candidate.publicId === spacePublicId,
  );

  if (!space) {
    return <SpaceNotFound />;
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <SpaceNavigationBar
        spacePublicId={spacePublicId}
        spaceName={space.name}
        currentCrumb={
          activeTab === "changesets" ? t("space.tab_changesets") : undefined
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
            <Text
              as="h1"
              size="2xl"
              bold
              color="primary"
              className="min-w-0 truncate"
            >
              {space.name}
            </Text>
          </div>

          <div className="mt-4">
            <SourceComposer spaceId={space.id} />
          </div>

          <SpaceTabs
            spacePublicId={spacePublicId}
            activeTab={activeTab}
            openChangesetCount={space.openChangesetCount}
          />

          {/* 스레드 탭 콘텐츠는 아직 없다 — 서버에 Digest 목록 API도
              digests.public_id도 없어서다. 생기면 여기 변경셋과 대칭으로
              <ThreadTab spaceId={space.id} />가 들어온다(surface-inventory.md
              "스레드 탭"). 그전까지 탭 바 아래가 비는 건 의도된 현재 상태다. */}
          {props.activeTab === "changesets" && (
            <ChangesetsTab
              subTab={props.subTab}
              onSubTabChange={props.onSubTabChange}
            />
          )}
        </div>
      </div>
    </main>
  );
}
