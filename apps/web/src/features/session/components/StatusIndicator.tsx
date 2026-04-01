import { Circle } from "@nema-io/weave/icons";

type IndicatorStatus = "in-progress" | "completed";

const STYLE_MAP: Record<IndicatorStatus, string> = {
  "in-progress": "animate-pulse",
  completed: "text-status-success",
};

interface StatusIndicatorProps {
  label: string;
  status: IndicatorStatus;
}

export function StatusIndicator({ label, status }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-fg-tertiary">
      <Circle className={`size-2 fill-current ${STYLE_MAP[status]}`} />
      <span>{label}</span>
    </div>
  );
}
