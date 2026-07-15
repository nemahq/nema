import { LoadingWatermark } from "@web/components/ui/LoadingWatermark";

// 메인 영역(<Outlet/> Suspense)의 공용 로딩 표시 — 페이지는 useSuspenseQuery로
// 여기 서스펜드시키고 개별 isLoading 분기를 두지 않는다. 자체 로딩 UI가 필요한
// 하위 영역만 스스로 Suspense 경계를 둔다.
export function ContentAreaFallback() {
  return (
    <div className="flex flex-1 items-center justify-center bg-surface-card">
      <LoadingWatermark />
    </div>
  );
}
