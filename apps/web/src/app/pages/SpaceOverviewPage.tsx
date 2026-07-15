import { SpaceOverview, type SpaceTab } from "@web/features/workspace";

interface SpaceOverviewPageProps {
  spacePublicId: string;
  activeTab: SpaceTab;
}

export function SpaceOverviewPage({
  spacePublicId,
  activeTab,
}: SpaceOverviewPageProps) {
  return <SpaceOverview spacePublicId={spacePublicId} activeTab={activeTab} />;
}
