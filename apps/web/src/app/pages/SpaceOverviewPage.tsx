import { SpaceOverview } from "@web/features/workspace";

interface SpaceOverviewPageProps {
  spaceId: string;
}

export function SpaceOverviewPage({ spaceId }: SpaceOverviewPageProps) {
  return <SpaceOverview spaceId={spaceId} />;
}
