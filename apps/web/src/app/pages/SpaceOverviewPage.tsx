import { SpaceOverview } from "@web/features/workspace";

interface SpaceOverviewPageProps {
  spacePublicId: string;
}

export function SpaceOverviewPage({ spacePublicId }: SpaceOverviewPageProps) {
  return <SpaceOverview spacePublicId={spacePublicId} />;
}
