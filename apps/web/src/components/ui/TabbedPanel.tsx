import type { ReactNode } from "react";

import { cn } from "@nema-io/weave";
import { X } from "@nema-io/weave/icons";

import type { TranslationKey } from "@web/lib/tolgee";
import { useTranslation } from "@web/lib/tolgee";

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
          <svg
            width="140"
            height="171"
            viewBox="96 74 178 211"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className="opacity-[0.06] dark:opacity-[0.08]"
          >
            <path
              fillRule="evenodd"
              transform="scale(0.359375)"
              d="M568.753 234.706C586.198 233.287 607.4 236.769 623.81 242.245C662.228 255.13 693.907 282.828 711.803 319.183C730.607 357.939 733.54 402.504 719.979 443.39C707.252 481.858 679.667 513.636 643.371 531.644C604.636 550.756 559.554 552.296 518.912 538.466L518.948 764.748C496.855 765.492 469.93 765.079 447.62 764.814L447.633 661.087L447.733 548.375C448.002 542.117 447.942 535.849 447.555 529.597C444.157 538.654 440.906 549.426 437.843 558.755L420.716 610.852L370.279 764.83C346.492 765.555 319.093 764.921 295.07 764.928L382.644 498.632L416.797 394.906C424.149 372.668 430.572 350.744 439.721 329.12C462.84 274.475 508.965 238.939 568.753 234.706Z M570.056 306.702C573.068 306.307 578.511 306.44 581.5 306.72C603.689 308.799 624.12 319.68 638.229 336.931C666.042 371.186 663.385 427.91 628.386 456.561C608.385 472.934 581.628 476.182 556.617 473.571C539.649 471.385 529.317 467.272 513.899 460.315C499.315 453.734 486.592 451.18 471.423 457.149C475.018 443.964 480.391 430.208 484.547 417.084C498.586 372.756 514.773 312.253 570.056 306.702Z"
            />
          </svg>
        </div>
      )}
    </TabbedPanelLayout>
  );
}
