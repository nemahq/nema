import { useState } from "react";
import * as Sentry from "@sentry/react";
import { TRPCClientError } from "@trpc/client";

import { usePendingAfterDelay } from "@web/hooks/usePendingAfterDelay";
import { trpc } from "@web/lib/trpc";

// trash_source가 "이미 trashed(다른 경로에서 먼저 지워짐)"거나 "아직 처리
// 중"일 때 던지는 정상적인 동시성 거부(source_state_changed, infra/supabase-error.ts
// 참고) — 원하는 최종 상태(삭제됨)는 이미 달성됐거나 곧 그리로 수렴하므로
// 실패로 세지도, "다시 시도하세요"로 안내하지도, Sentry로 올리지도 않는다.
function isSourceStateConflict(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === "CONFLICT";
}

// useDeleteSource(단건용 훅)는 성공마다 자기 onSuccess에서 listPending을
// invalidate한다 — 이 훅 하나로 N번 병렬 호출하면 삭제가 끝날 때마다 목록
// refetch가 줄줄이 걸려 체감 속도가 크게 느려진다. utils.client로 훅을
// 거치지 않고 직접 호출해 개별 invalidate를 피하고, 다 끝난 뒤 한 번만 한다.
export function useDeleteWaitingDrafts() {
  const utils = trpc.useUtils();
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingAfterDelay = usePendingAfterDelay(isDeleting);

  async function deleteAll(sourceIds: string[]): Promise<{
    failedCount: number;
  }> {
    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        sourceIds.map((sourceId) =>
          utils.client.source.delete.mutate({ sourceId }),
        ),
      );
      await utils.source.listPending.invalidate();
      // utils.client 직접 호출은 MutationCache를 우회해 전역 Sentry 캡처가 안
      // 걸린다 — 여기서 직접 보고해야 실제 실패가 조용히 사라지지 않는다.
      const unexpectedFailures = results.filter(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected" && !isSourceStateConflict(result.reason),
      );
      for (const failure of unexpectedFailures) {
        Sentry.captureException(failure.reason);
      }
      return { failedCount: unexpectedFailures.length };
    } finally {
      setIsDeleting(false);
    }
  }

  return { deleteAll, isDeleting, isDeletingAfterDelay };
}
