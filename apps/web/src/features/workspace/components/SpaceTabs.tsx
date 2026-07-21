import { useNavigate } from "@tanstack/react-router";

import { useTranslation } from "@web/lib/tolgee";

import { SpaceTabButton } from "./SpaceTabButton";

type SpaceTab = "topic" | "changesets";

interface SpaceTabsProps {
  spacePublicId: string;
  activeTab: SpaceTab;
  openChangesetCount: number;
}

// 탭을 배열 데이터로 돌리지 않고 두 벌을 그대로 적는다 — 두 탭의 목적지 타입이
// 서로 달라(변경셋만 subTab search를 요구) 배열 하나로 묶으면 TanStack Router의
// to·search 상관 타입이 풀린다. 탭이 늘어날 조짐이 보이면 그때 다시 본다.
export function SpaceTabs({
  spacePublicId,
  activeTab,
  openChangesetCount,
}: SpaceTabsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  function goToTopic() {
    void navigate({ to: "/space/$spacePublicId", params: { spacePublicId } });
  }

  function goToChangesets() {
    void navigate({
      to: "/space/$spacePublicId/changesets",
      params: { spacePublicId },
      search: { subTab: "open" },
    });
  }

  return (
    // 탭만 sticky — 스크롤 중 자연스러운 위치가 top:0(네비게이션 바 바로 아래)에
    // 닿는 순간부터만 고정된다(sticky의 기본 동작), 그 전까진 컴포저·제목과 함께
    // 평소처럼 스크롤된다.
    <div className="sticky top-0 z-10 mt-6 flex gap-1 border-b border-border bg-surface-card">
      <SpaceTabButton active={activeTab === "topic"} onClick={goToTopic}>
        {t("space.tab_topic")}
      </SpaceTabButton>
      <SpaceTabButton
        active={activeTab === "changesets"}
        onClick={goToChangesets}
        count={openChangesetCount}
      >
        {t("space.tab_changesets")}
      </SpaceTabButton>
    </div>
  );
}
