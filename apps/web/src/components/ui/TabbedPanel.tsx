import type { ReactNode } from "react";

import { cn } from "@nema-io/weave";
import type { WeaveIcon } from "@nema-io/weave/icons";
import { X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

import { TabbedPanelLayout } from "./TabbedPanelLayout";

export interface TabbedPanelTab {
  id: string;
  labelKey: TranslationKey;
  icon?: WeaveIcon;
  content: ReactNode;
  onClose?: () => void;
}

interface TabbedPanelProps {
  tabs: TabbedPanelTab[];
  activeTabId: string;
  onActiveTabChange: (tabId: string) => void;
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
                    {tab.icon && <tab.icon className="size-3.5" />}
                    {t(tab.labelKey)}
                  </button>
                  {tab.onClose && (
                    <button
                      type="button"
                      onClick={(e) => handleTabClose(e, tab)}
                      className="mr-1 rounded p-0.5 text-fg-tertiary transition-colors hover:bg-surface-raised-hover hover:text-fg-primary"
                      aria-label={t("session.draft_tab_close", {
                        label: t(tab.labelKey),
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
        <div className="flex flex-1 items-center justify-center text-fg-quaternary">
          {/* TODO: 로고 에셋으로 교체 */}
          <span className="text-lg font-semibold">Logo</span>
        </div>
      )}
    </TabbedPanelLayout>
  );
}
