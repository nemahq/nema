import { Circle } from "@nema-io/weave/icons";

interface StatusIndicatorProps {
  label: string;
  inProgress: boolean;
}

export function StatusIndicator({ label, inProgress }: StatusIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5 py-1 text-xs text-fg-tertiary">
      <Circle
        className={`size-2 fill-current ${inProgress ? "animate-pulse" : "text-status-success"}`}
      />
      <span>{label}</span>
    </div>
  );
}
