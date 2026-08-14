import { TextSkeleton } from "@nema-io/weave";

// SourceDetailBody(제목·본문)와 같은 위치에만 깜빡인다 — 헤더는 이 컴포넌트
// 바깥(SourceDetailPanel)이 항상 따로 그리므로 여기서 자리를 맞출 필요가 없다.
const BODY_LINE_WIDTHS = ["100%", "100%", "92%", "100%", "64%"];

export function SourceDetailPanelSkeleton() {
  return (
    <>
      <div className="px-6 pt-3">
        <TextSkeleton size="xl" className="w-2/3 max-w-80" />
      </div>

      <div className="flex flex-1 flex-col gap-2 px-6 py-4">
        {BODY_LINE_WIDTHS.map((width, index) => (
          <TextSkeleton key={index} size="sm" style={{ width }} />
        ))}
      </div>
    </>
  );
}
