import { Badge, type BadgeVariant } from "@nema-io/weave";

import type { RelationMarkers as RelationMarkersData } from "@web/features/dev-harness/types";

const MARKER_META: Record<
  keyof RelationMarkersData,
  { label: string; variant: BadgeVariant }
> = {
  supersededBy: { label: "지난 것", variant: "warning" },
  conflictsWith: { label: "충돌", variant: "error" },
  resolvedBy: { label: "닫힘", variant: "neutral" },
};

const MARKER_ORDER = [
  "supersededBy",
  "conflictsWith",
  "resolvedBy",
] as const satisfies (keyof RelationMarkersData)[];

interface RelationMarkersProps {
  supersededBy?: string[];
  conflictsWith?: string[];
  resolvedBy?: string[];
  // 상대 진술 ID를 표시 라벨로 — 같은 검색 결과에 있으면 본문, 없으면 ID 앞자리(부모가 결정)
  resolveLabel: (id: string) => string;
}

export function RelationMarkers({
  supersededBy,
  conflictsWith,
  resolvedBy,
  resolveLabel,
}: RelationMarkersProps) {
  const byKey: RelationMarkersData = {
    supersededBy,
    conflictsWith,
    resolvedBy,
  };
  const present = MARKER_ORDER.filter((key) => (byKey[key]?.length ?? 0) > 0);

  if (present.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 border-t border-border/30 pt-1">
      {present.map((key) => {
        const meta = MARKER_META[key];
        const ids = byKey[key] ?? [];
        return (
          <div key={key} className="flex items-start gap-1.5">
            <Badge variant={meta.variant} className="shrink-0">
              {meta.label} {ids.length}
            </Badge>
            <span className="min-w-0 flex-1 text-xs text-fg-tertiary">
              {ids.map(resolveLabel).join("  ·  ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}
