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
    return addTag.mutateAsync({ referenceId, tagId: tag.id });
  }

  // 생성 성공 후 연결(addTag)만 실패해도 태그 자체는 이미 만들어진 채로 남는다
  // (고아 태그) — 이걸 여기서 지우거나 재시도하지 않는다. TagAddPopover가 실패
  // 시 검색 화면으로 돌아가고, tag.list는 createTag.onSuccess에서 이미
  // invalidate돼 있어 방금 만든 태그가 후보로 뜨니 거기서 다시 선택하면 된다.
  async function handleCreateNew(draft: {
    title: string;
    description: string;
  }) {
    const { tagId } = await createTag.mutateAsync(draft);
    await addTag.mutateAsync({ referenceId, tagId });
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
