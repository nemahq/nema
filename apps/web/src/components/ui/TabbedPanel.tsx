import type { ReactNode } from "react";

import { cn } from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

import { NemaMarkIcon } from "./NemaMarkIcon";
import { TabbedPanelLayout } from "./TabbedPanelLayout";

type TabBase = {
  id: string;
  content: ReactNode;
  onClose?: () => void;
};

export type TabbedPanelTab = TabBase &
  ({ labelKey: TranslationKey } | { label: string });

interface TabbedPanelProps {
  tabs: TabbedPanelTab[];
  activeTabId: string;
  onActiveTabChange: (tabId: string) => void;
}

function resolveLabel(
  tab: TabbedPanelTab,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  return "label" in tab ? tab.label : t(tab.labelKey);
}

export function TabbedPanel({
  tabs,
  activeTabId,
  onActiveTabChange,
}: TabbedPanelProps) {
  const { t } = useTranslation();

  const activeTabData = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const resolvedTab = activeTabData?.id ?? "";

  function handleTabClose(e: React.MouseEvent, tab: TabbedPanelTab) {
    e.stopPropagation();
    tab.onClose?.();
  }

  return (
    <TabbedPanelLayout
      header={
        tabs.length > 0
          ? tabs.map((tab, i) => {
              const isActive = resolvedTab === tab.id;
              const isFirst = i === 0;

              return (
                <div
                  key={tab.id}
                  className={cn(
                    "group -mb-px flex items-center",
                    isActive
                      ? cn(
                          "border-r border-t-2 border-t-amber-600 border-r-border bg-surface-card dark:border-t-amber-500",
                          !isFirst && "border-l border-l-border",
                        )
                      : "border border-transparent",
                  )}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`panel-${tab.id}`}
                    onClick={() => onActiveTabChange(tab.id)}
                    className={cn(
                      "flex items-center gap-1 py-2 pl-3",
                      tab.onClose ? "pr-1" : "pr-3",
                      "text-sm font-medium transition-colors",
                      isActive
                        ? "text-fg-primary"
                        : "text-fg-tertiary hover:text-fg-secondary",
                    )}
                  >
                    {resolveLabel(tab, t)}
                  </button>
                  {tab.onClose && (
                    <button
                      type="button"
                      onClick={(e) => handleTabClose(e, tab)}
                      className="mr-1 rounded p-0.5 text-fg-tertiary transition-colors hover:bg-surface-raised-hover hover:text-fg-primary"
                      aria-label={t("session.draft_tab_close", {
                        label: resolveLabel(tab, t),
                      })}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              );
            })
          : null
      }
    >
      {tabs.length > 0 ? (
        <div role="tabpanel" id={`panel-${resolvedTab}`}>
          {activeTabData?.content}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <NemaMarkIcon
            width={140}
            height={171}
            fill="currentColor"
            className="opacity-[0.06] dark:opacity-[0.08]"
          />
        </div>
      )}
    </TabbedPanelLayout>
  );
}
