import { Skeleton } from "./Skeleton";

const LINE_WIDTHS = ["w-full", "w-4/5", "w-3/5"] as const;

interface TextShimmerProps {
  lines?: number;
}

function TextShimmer({ lines = 3 }: TextShimmerProps) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className={`h-3.5 rounded ${LINE_WIDTHS[i % LINE_WIDTHS.length]}`}
        />
      ))}
    </div>
  );
}

export { TextShimmer };
