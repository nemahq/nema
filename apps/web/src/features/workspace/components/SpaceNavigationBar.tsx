import { linkOptions } from "@tanstack/react-router";

import { NavigationBar } from "@web/components/layout/NavigationBar";

import { SpaceBadge } from "./SpaceBadge";

interface SpaceNavigationBarProps {
  spacePublicId: string;
  spaceName: string;
  // 하위 페이지(변경셋 탭 등)에 있을 때만 넘긴다 — 있으면 Space 이름이 상위로
  // 올라가는 링크가 되고 그 뒤에 현재 위치가 붙는다. 없으면 Space 이름 자체가
  // 현재 위치라 링크가 아니다.
  currentCrumb?: string;
}

export function SpaceNavigationBar({
  spacePublicId,
  spaceName,
  currentCrumb,
}: SpaceNavigationBarProps) {
  const spaceCrumb = {
    label: spaceName,
    icon: <SpaceBadge name={spaceName} size="sm" />,
    ...(currentCrumb
      ? linkOptions({ to: "/space/$spacePublicId", params: { spacePublicId } })
      : {}),
  };

  return (
    <NavigationBar
      items={
        currentCrumb ? [spaceCrumb, { label: currentCrumb }] : [spaceCrumb]
      }
    />
  );
}
