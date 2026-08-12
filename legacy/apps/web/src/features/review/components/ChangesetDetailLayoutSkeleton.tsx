import { NavigationBar } from "@web/components/layout/NavigationBar";

// ChangesetDetailLayout과 같은 골격을 Space 이름·제목 없이 낸다 — 데이터가 오기 전엔
// 브레드크럼을 채울 수 없어서다.
export function ChangesetDetailLayoutSkeleton() {
  return (
    <main className="flex flex-1 flex-col bg-surface-card">
      <NavigationBar />
      <div data-main-scroll-area className="flex-1 overflow-y-auto" />
    </main>
  );
}
