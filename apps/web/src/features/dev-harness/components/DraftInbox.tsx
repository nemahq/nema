import { DraftCard } from "@web/features/dev-harness/components/DraftCard";
import { useDraftListQuery } from "@web/features/dev-harness/hooks/useDraftListQuery";
import { useTopicListQuery } from "@web/features/dev-harness/hooks/useTopicListQuery";
import { getErrorMessage } from "@web/lib/getErrorMessage";

// 확정 대기 초안 인박스. 여기서 손보고 확정해야 넣기가 추출로 넘어간다.
export function DraftInbox() {
  const draftListQuery = useDraftListQuery();
  const topicListQuery = useTopicListQuery();

  const drafts = draftListQuery.data?.drafts ?? [];
  const topicOptions = topicListQuery.data?.topics ?? [];

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-fg-tertiary">
        대기 초안 ({drafts.length})
      </h3>

      {draftListQuery.isError && (
        <p className="text-xs text-status-error">
          {getErrorMessage(draftListQuery.error)}
        </p>
      )}
      {!draftListQuery.isLoading && drafts.length === 0 && (
        <p className="text-xs text-fg-tertiary">
          비어 있음 — 위에서 초안을 만들면 여기로 떨어진다
        </p>
      )}

      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
        {drafts.map((draft) => (
          <DraftCard key={draft.id} draft={draft} topicOptions={topicOptions} />
        ))}
      </div>
    </div>
  );
}
