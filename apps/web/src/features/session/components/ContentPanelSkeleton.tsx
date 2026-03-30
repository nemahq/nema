import { Skeleton } from "@nema-io/weave";

import { TabbedPanelLayout } from "@web/components/ui/TabbedPanelLayout";

const TAB_HEADER_HEIGHT_PX = 38;
const LINE_WIDTHS = ["w-4/5", "w-3/5", "w-[90%]", "w-2/5", "w-3/4"];

export function ContentPanelSkeleton() {
  return (
    <TabbedPanelLayout
      header={
        <div
          className="relative flex items-end border-b border-border/50"
          style={{ height: TAB_HEADER_HEIGHT_PX }}
        >
          <div className="-mb-px flex h-[calc(100%+1px)] items-center gap-1 border-r border-r-border bg-surface-card px-3">
            <Skeleton className="size-3.5 rounded-sm" />
            <Skeleton className="h-3.5 w-8 rounded-sm" />
          </div>
        </div>
      }
    >
      <div className="space-y-2.5">
        {LINE_WIDTHS.map((width, i) => (
          <Skeleton
            key={i}
            className={`h-3.5 rounded-sm ${width}`}
            style={{
              animationDelay: `${i * 100}ms`,
              opacity: 1 - i * 0.12,
            }}
          />
        ))}
      </div>
    </TabbedPanelLayout>
  );
}
