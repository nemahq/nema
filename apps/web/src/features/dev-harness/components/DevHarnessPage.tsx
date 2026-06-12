import { IngestPanel } from "@web/features/dev-harness/components/IngestPanel";
import { SearchPanel } from "@web/features/dev-harness/components/SearchPanel";

// 내부 테스트 조종석 (NEM-125) — 제품 화면이 아니다.
// 진술 엔진(넣기·검색)을 실입력으로 만져보며 절단·검색 품질을 보정하는 dogfooding 입구.
export function DevHarnessPage() {
  return (
    <main className="flex min-w-0 flex-1 bg-surface-card">
      <div className="flex min-w-0 flex-1 flex-col border-r border-border/60">
        <IngestPanel />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <SearchPanel />
      </div>
    </main>
  );
}
