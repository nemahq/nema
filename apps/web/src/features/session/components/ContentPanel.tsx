import type { ComponentType, ReactNode } from "react";
import { useState } from "react";

import { cn } from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

export interface ContentPanelTab {
  id: string;
  labelKey: TranslationKey;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
  onClose?: () => void;
}

interface ContentPanelProps {
  tabs: ContentPanelTab[];
}

export function ContentPanel({ tabs }: ContentPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  const activeTabData = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const resolvedTab = activeTabData?.id ?? "";

  function handleTabClick(tabId: string) {
    setActiveTab(tabId);
  }

  function handleTabClose(e: React.MouseEvent, tab: ContentPanelTab) {
    e.stopPropagation();
    tab.onClose?.();
  }

  return (
    <main className="flex flex-1 flex-col bg-surface-card min-w-0">
      {tabs.length > 0 ? (
        <>
          <div
            role="tablist"
            className="relative flex items-end border-b border-border"
          >
            {tabs.map((tab, i) => {
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
                    onClick={() => handleTabClick(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 py-2 pl-3 pr-1",
                      "text-sm font-medium transition-colors",
                      isActive
                        ? "text-fg-primary"
                        : "text-fg-tertiary hover:text-fg-secondary",
                    )}
                  >
                    <tab.icon className="size-3.5" />
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
            })}
          </div>

          <div
            role="tabpanel"
            id={`panel-${activeTabData.id}`}
            className="flex-1 overflow-y-auto p-5 [scrollbar-width:thin] [scrollbar-color:var(--color-border)_transparent]"
          >
            {activeTabData.content}
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center text-fg-quaternary">
          {/* TODO: 로고 에셋으로 교체 */}
          <span className="text-lg font-semibold">Logo</span>
        </div>
      )}
    </main>
  );
}
