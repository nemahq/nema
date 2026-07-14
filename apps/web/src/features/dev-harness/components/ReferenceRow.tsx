import { useState } from "react";

import { Button } from "@nema-io/weave";

import { useReferenceCitingDigestsQuery } from "@web/features/dev-harness/hooks/useReferenceCitingDigestsQuery";
import { useTrashReference } from "@web/features/dev-harness/hooks/useTrashReference";
import type { ReferenceSummary } from "@web/features/dev-harness/types";
import { getErrorMessage } from "@web/lib/getErrorMessage";

interface ReferenceRowProps {
  referenceId: string;
  title: string;
  type: ReferenceSummary["type"];
  status: ReferenceSummary["status"];
}

// ConfirmButton의 단순 무장/실행 두 단계로는 안 맞는다 — 무장 시 인용 Digest 목록을
// 먼저 보여준 뒤에 실행해야 한다(intake-flow "레퍼런스 삭제" 인용 있음 케이스).
export function ReferenceRow({
  referenceId,
  title,
  type,
  status,
}: ReferenceRowProps) {
  const [armed, setArmed] = useState(false);
  const citingQuery = useReferenceCitingDigestsQuery(referenceId, {
    enabled: armed,
  });
  const trashReference = useTrashReference();

  const citingDigests = citingQuery.data?.digests ?? [];
  // trash_reference RPC는 active만 대상으로 한다 — archived는 정리(archive) 상태라
  // 삭제 버튼 자체를 안 보여준다(TopicRow의 status 분기와 같은 결).
  const canTrash = status === "active";

  return (
    <li className="flex flex-col gap-1 rounded-lg border border-border/60 bg-surface-card p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-fg-primary">{title}</span>
          <span className="text-[10px] text-fg-tertiary">
            {type} · {status}
          </span>
        </div>

        {canTrash && !armed && (
          <Button size="xs" variant="ghost" onClick={() => setArmed(true)}>
            삭제
          </Button>
        )}
      </div>

      {canTrash && armed && (
        <div className="flex flex-col gap-1 border-t border-border/30 pt-1">
          {citingQuery.isLoading && (
            <p className="text-xs text-fg-tertiary">인용 확인 중…</p>
          )}
          {citingQuery.isError && (
            <p className="text-xs text-status-error">
              {getErrorMessage(citingQuery.error)}
            </p>
          )}
          {!citingQuery.isLoading && citingDigests.length > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-status-error">
                인용 중인 Digest {citingDigests.length}개예요 — 삭제하면 죽은
                링크로 남아요
              </span>
              <ul className="list-disc pl-4">
                {citingDigests.map((digest) => (
                  <li key={digest.id} className="text-xs text-fg-secondary">
                    {digest.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <span className="flex items-center gap-1">
            <Button
              size="xs"
              variant="danger"
              disabled={citingQuery.isLoading || trashReference.isPending}
              onClick={() => trashReference.mutate({ referenceId })}
            >
              확실히 삭제
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setArmed(false)}>
              취소
            </Button>
          </span>
        </div>
      )}

      {trashReference.error && (
        <p className="text-xs text-status-error">
          {getErrorMessage(trashReference.error)}
        </p>
      )}
    </li>
  );
}
