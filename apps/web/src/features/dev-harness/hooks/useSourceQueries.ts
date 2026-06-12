import { SOURCE_POLL_INTERVAL_MS } from "@web/features/dev-harness/constants";
import { trpc } from "@web/lib/trpc";

// 추출이 끝나지 않은 source가 보이는 동안만 폴링한다 (ingestion-design 2장 — 박제 응답 + 폴링)
export function useSourceListQuery() {
  return trpc.source.list.useQuery(undefined, {
    refetchInterval: (query) =>
      query.state.data?.sources.some((s) => s.extractionStatus === "pending")
        ? SOURCE_POLL_INTERVAL_MS
        : false,
  });
}

export function useSourceQuery(input: { sourceId: string }) {
  return trpc.source.get.useQuery(input, {
    refetchInterval: (query) =>
      query.state.data?.extractionStatus === "pending"
        ? SOURCE_POLL_INTERVAL_MS
        : false,
  });
}

export function useCreateSource(options?: {
  onCreated?: (sourceId: string) => void;
}) {
  const utils = trpc.useUtils();
  return trpc.source.create.useMutation({
    onSuccess: ({ sourceId }) => {
      utils.source.list.invalidate();
      options?.onCreated?.(sourceId);
    },
  });
}
