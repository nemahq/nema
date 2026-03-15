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

export function ContentPanel({ tabs }: { tabs: ContentPanelTab[] }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  const resolvedTab =
    tabs.find((t) => t.id === activeTab)?.id ?? tabs[0]?.id ?? "";

  function handleTabClick(tabId: string) {
    setActiveTab(tabId);
  }

  function handleTabClose(e: React.MouseEvent, tab: ContentPanelTab) {
    e.stopPropagation();
    tab.onClose?.();
  }

  const activeTabData = tabs.find((tab) => tab.id === resolvedTab) ?? tabs[0];

  return (
    <main className="flex flex-1 flex-col bg-surface-card min-w-0">
      {tabs.length > 0 ? (
        <>
          <div
            role="tablist"
            className="flex items-center border-b border-border"
          >
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "group flex items-center border-b-2",
                  resolvedTab === tab.id
                    ? "border-brand"
                    : "border-transparent",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={resolvedTab === tab.id}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 py-2 pl-3 pr-1",
                    "text-sm font-medium transition-colors hover:bg-surface-raised",
                    resolvedTab === tab.id
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
            ))}
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
