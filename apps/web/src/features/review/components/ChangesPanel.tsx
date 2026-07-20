import type { ChangesSubTab } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetList } from "./ChangesetList";
import { ChangesSubTabButton } from "./ChangesSubTabButton";

interface ChangesPanelProps {
  spacePublicId: string;
  // Space 조회가 끝나기 전엔 아직 없다 — 서브탭은 그대로 두고 목록만 안 매단다.
  spaceId: string | undefined;
  subTab: ChangesSubTab;
  onSubTabChange: (subTab: ChangesSubTab) => void;
}

export function ChangesPanel({
  spacePublicId,
  spaceId,
  subTab,
  onSubTabChange,
}: ChangesPanelProps) {
  const { t } = useTranslation();

  function selectOpen() {
    onSubTabChange("open");
  }

  function selectClosed() {
    onSubTabChange("closed");
  }

  return (
    <div className="flex w-full flex-col gap-3 py-4">
      <div className="flex w-fit gap-1 rounded-lg bg-surface-card p-1">
        <ChangesSubTabButton active={subTab === "open"} onClick={selectOpen}>
          {t("review.tab_open")}
        </ChangesSubTabButton>
        <ChangesSubTabButton
          active={subTab === "closed"}
          onClick={selectClosed}
        >
          {t("review.tab_closed")}
        </ChangesSubTabButton>
      </div>

      {spaceId && (
        <ChangesetList
          spacePublicId={spacePublicId}
          spaceId={spaceId}
          subTab={subTab}
        />
      )}
    </div>
  );
}
