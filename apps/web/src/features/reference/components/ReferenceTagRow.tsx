import { RegisteredLabelChip } from "@web/components/ui/RegisteredLabelChip";
import { TagAddPopover } from "@web/components/ui/TagAddPopover";
import { useAddReferenceTag } from "@web/features/reference/hooks/useAddReferenceTag";
import { useRemoveReferenceTag } from "@web/features/reference/hooks/useRemoveReferenceTag";
import type { ReferenceTagSummary } from "@web/features/reference/types";
import { useMutation } from "@web/lib/tanstack-query";
import { useTranslation } from "@web/lib/tolgee";
import { trpc } from "@web/lib/trpc";

interface ReferenceTagRowProps {
  referenceId: string;
  tags: ReferenceTagSummary[];
  disabled: boolean;
}

// Digest 리뷰의 TagChipRow(review-flow)와 달리, 여기 태그는 changeset 없이
// 클릭 즉시 서버에 반영된다(browsing-flow.md "Reference Tag 추가/제거") —
// 그래서 로컬 draft 배열이 아니라 각 칩이 자기 뮤테이션을 직접 문다.
export function ReferenceTagRow({
  referenceId,
  tags,
  disabled,
}: ReferenceTagRowProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const createTag = useMutation(trpc.tag.create, {
    onSuccess: () => utils.tag.list.invalidate(),
  });
  const addTag = useAddReferenceTag();
  const removeTag = useRemoveReferenceTag();

  function handleSelectExisting(tag: { id: string; title: string }) {
    addTag.mutate({ referenceId, tagId: tag.id });
  }

  function handleCreateNew(draft: { title: string; description: string }) {
    createTag.mutate(draft, {
      onSuccess: ({ tagId }) => {
        addTag.mutate({ referenceId, tagId });
      },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <RegisteredLabelChip
          key={tag.id}
          label={tag.title}
          variant="neutral"
          disabled={
            disabled ||
            (removeTag.isPending && removeTag.variables?.tagId === tag.id)
          }
          removeAriaLabel={t("reference.tag_remove_action")}
          onRemove={() => removeTag.mutate({ referenceId, tagId: tag.id })}
        />
      ))}
      <TagAddPopover
        disabled={disabled}
        excludedTagIds={tags.map((tag) => tag.id)}
        existingLabels={tags.map((tag) => tag.title)}
        onSelectExisting={handleSelectExisting}
        onCreateNew={handleCreateNew}
      />
    </div>
  );
}
