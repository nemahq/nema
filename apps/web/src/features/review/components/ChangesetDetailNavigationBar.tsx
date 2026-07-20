import { Suspense } from "react";
import { linkOptions } from "@tanstack/react-router";

import { NavigationBar } from "@web/components/layout/NavigationBar";
import { SpaceBadge, useSpaceListSuspenseQuery } from "@web/features/workspace";
import { useTranslation } from "@web/lib/tolgee";

interface ChangesetDetailNavigationBarProps {
  spacePublicId: string;
  title: string;
}

// Space 이름은 publicId에서 파생되는 값이라 호출부가 넘기지 않고 여기서 직접
// 해석한다(사이드바가 이미 캐시). suspense 쿼리를 쓰므로 Suspense 경계를 이 파일에
// 함께 두고, 이름이 아직 없는 짧은 구간은 브레드크럼 스켈레톤으로 대체한다.
function ChangesetDetailNavigationBarContent({
  spacePublicId,
  title,
}: ChangesetDetailNavigationBarProps) {
  const { t } = useTranslation();
  const [spaceList] = useSpaceListSuspenseQuery();
  const spaceName =
    spaceList.spaces.find((space) => space.publicId === spacePublicId)?.name ??
    "";

  return (
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
            to: "/space/$spacePublicId/changesets",
            params: { spacePublicId },
            search: { subTab: "open" },
          }),
        },
        { label: title },
      ]}
    />
  );
}

// Open/Closed 리뷰 화면이 공유하는 브레드크럼(`[Space] › 변경사항 › 제목`) — 상태와
// 무관해 두 화면이 같은 chrome을 낸다. 가운데 항목은 open/closed 모두 변경사항 탭의
// 기본 진입(open 서브탭)으로 보낸다.
export function ChangesetDetailNavigationBar(
  props: ChangesetDetailNavigationBarProps,
) {
  return (
    <Suspense fallback={<NavigationBar />}>
      <ChangesetDetailNavigationBarContent {...props} />
    </Suspense>
  );
}
