import type { ChangesSubTab } from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { ChangesetList } from "./ChangesetList";
import { ChangesetSubTabButton } from "./ChangesetSubTabButton";

interface ChangesPanelProps {
  subTab: ChangesSubTab;
  onSubTabChange: (subTab: ChangesSubTab) => void;
}

export function ChangesPanel({ subTab, onSubTabChange }: ChangesPanelProps) {
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
        <ChangesetSubTabButton active={subTab === "open"} onClick={selectOpen}>
          {t("review.tab_open")}
        </ChangesetSubTabButton>
        <ChangesetSubTabButton
          active={subTab === "closed"}
          onClick={selectClosed}
        >
          {t("review.tab_closed")}
        </ChangesetSubTabButton>
      </div>

      <ChangesetList subTab={subTab} />
    </div>
  );
}
