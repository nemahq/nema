import { IngestPanel } from "@web/features/dev-harness/components/IngestPanel";
import { SearchPanel } from "@web/features/dev-harness/components/SearchPanel";

export function WorkTab() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col border-r border-border/60">
        <IngestPanel />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <SearchPanel />
      </div>
    </div>
  );
}
