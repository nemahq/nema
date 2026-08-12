import { Badge, Button } from "@nema-io/weave";

import { RELATION_META } from "@web/features/dev-harness/relationMeta";
import type { PendingRelation } from "@web/features/dev-harness/types";
import { formatDateTime } from "@web/features/dev-harness/utils";

// 충돌은 승자 진술을 골라야 하고 중복은 병합 확정이라 판정 종류가 다르다 — RPC
// 계약(resolveConflictRelation/resolveDuplicateRelation)과 같은 구분.
export type Marking =
  | { kind: "reject" }
  | { kind: "winner"; statementId: string }
  | { kind: "merge" };

interface PendingRelationCardProps {
  relationType: PendingRelation["relationType"];
  stale: boolean;
  createdAt: string;
  from?: { id: string; content: string };
  to?: { id: string; content: string };
  marking?: Marking;
  resultOk?: boolean;
  resultMessage?: string;
  disabled: boolean;
  onMark: (next: Marking | null) => void;
}

export function PendingRelationCard({
  relationType,
  stale,
  createdAt,
  from,
  to,
  marking,
  resultOk,
  resultMessage,
  disabled,
  onMark,
}: PendingRelationCardProps) {
  const meta = RELATION_META[relationType];
  const isConflict = relationType === "conflicts";

  function toggle(next: Marking) {
    const same =
      next.kind === "winner"
        ? marking?.kind === "winner" && marking.statementId === next.statementId
        : marking?.kind === next.kind;
    onMark(same ? null : next);
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-surface-raised px-3 py-2">
      <div className="flex items-center gap-2">
        <Badge variant={meta.variant}>{meta.label}</Badge>
        {stale && <Badge variant="neutral">끊김</Badge>}
        <span className="flex-1" />
        <span className="text-xs tabular-nums text-fg-tertiary">
          {formatDateTime(createdAt)}
        </span>
      </div>

      <div className="flex flex-col gap-0.5 text-sm text-fg-primary">
        <p className="min-w-0">{from?.content ?? "(가려진 진술)"}</p>
        <span className="text-xs text-fg-tertiary">↓ {meta.label}</span>
        <p className="min-w-0">{to?.content ?? "(가려진 진술)"}</p>
      </div>

      <div className="flex items-center gap-2">
        {isConflict ? (
          <>
            <Button
              size="xs"
              variant={
                marking?.kind === "winner" && marking.statementId === from?.id
                  ? "secondary"
                  : "ghost"
              }
              disabled={disabled || stale || !from}
              onClick={() =>
                from && toggle({ kind: "winner", statementId: from.id })
              }
            >
              A 유지
            </Button>
            <Button
              size="xs"
              variant={
                marking?.kind === "winner" && marking.statementId === to?.id
                  ? "secondary"
                  : "ghost"
              }
              disabled={disabled || stale || !to}
              onClick={() =>
                to && toggle({ kind: "winner", statementId: to.id })
              }
            >
              B 유지
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant={marking?.kind === "merge" ? "secondary" : "ghost"}
            disabled={disabled || stale}
            onClick={() => toggle({ kind: "merge" })}
          >
            병합 확인(A 내용 기본값)
          </Button>
        )}
        <Button
          size="xs"
          variant={marking?.kind === "reject" ? "danger" : "ghost"}
          disabled={disabled}
          onClick={() => toggle({ kind: "reject" })}
        >
          거절 표시
        </Button>
        <span className="flex-1" />
        {resultOk && (
          <span className="text-xs text-status-success">처리됨</span>
        )}
        {resultMessage && (
          <span className="text-xs text-status-error">{resultMessage}</span>
        )}
      </div>
    </div>
  );
}
