import { Suspense, useState } from "react";

import type { DigestTagDraft } from "@nema-io/shared";

import { useUpdateTag } from "@web/features/review/hooks/useUpdateTag";
import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import { buildLabelSearchState } from "@web/utils/labelSearch";

import { LabelInlineEditPopover } from "./LabelInlineEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { LabelTextInput } from "./LabelTextInput";

interface ReviewTag {
  id: string;
  title: string;
  description: string;
}

interface TagSearchListProps {
  query: string;
  // TopicSearchList와 같은 이유로 파생값(Set·이름 배열) 대신 원본 배열을 받는다.
  tags: DigestTagDraft[];
  onSelectExisting: (tag: ReviewTag) => void;
  onStartCreate: (title: string) => void;
  onRenamed: (tag: ReviewTag) => void;
}

const getTagLabel = (tag: { title: string }) => tag.title;

function TagSearchListContent({
  query,
  tags,
  onSelectExisting,
  onStartCreate,
  onRenamed,
}: TagSearchListProps) {
  const [tagList] = useTagListSuspenseQuery();
  const updateTag = useUpdateTag();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingDescription, setEditingDescription] = useState("");

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: tagList.tags,
      getLabel: getTagLabel,
      query,
      existingLabels: tags.map((tag) => tag.title),
    });
  const attachedIds = new Set(tags.map((tag) => tag.id));

  // TopicSearchList와 같은 계약 — 오버레이가 어떻게 닫히든 그 시점의 값을 적용한다.
  // description은 필수라 빈 값이면 저장을 건너뛰고 원래 값을 유지한다.
  function applyAndClose(tag: ReviewTag) {
    const title = editingTitle.trim();
    const description = editingDescription.trim();
    const changed = title !== tag.title || description !== tag.description;
    if (changed && title !== "" && description !== "") {
      updateTag.mutate(
        { id: tag.id, title, description },
        { onSuccess: () => onRenamed({ id: tag.id, title, description }) },
      );
    }
    setEditingId(null);
  }

  function handleEditOpenChange(tag: ReviewTag, open: boolean) {
    if (open) {
      setEditingId(tag.id);
      setEditingTitle(tag.title);
      setEditingDescription(tag.description);
      return;
    }
    applyAndClose(tag);
  }

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0}
      hasAnyLabel={tagList.tags.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
    >
      {candidates.map((tag) => (
        <LabelSearchRow
          key={tag.id}
          label={tag.title}
          attached={attachedIds.has(tag.id)}
          editing={editingId === tag.id}
          onSelect={() => onSelectExisting(tag)}
        >
          <LabelInlineEditPopover
            open={editingId === tag.id}
            onOpenChange={(open) => handleEditOpenChange(tag, open)}
          >
            {/* Tag는 description이 필수(07-modeling.md)라 값이 이미 있는 게
                보장돼 있다 — Notion의 "값 없으면 접어두고 버튼으로 펼침"이
                여기선 안 맞아서 접이식을 버리고 이름·설명 둘 다 상시 노출한다.
                설명도 한 줄로 — 다른 필드들과 같은 "메뉴형" 밀도를 유지한다
                (TAG_DESCRIPTION_MAX_LENGTH=500이라 긴 값은 가로 스크롤된다). */}
            <LabelTextInput
              autoFocus
              value={editingTitle}
              onChange={setEditingTitle}
              onSubmit={() => applyAndClose(tag)}
            />
            <LabelTextInput
              value={editingDescription}
              onChange={setEditingDescription}
              onSubmit={() => applyAndClose(tag)}
            />
          </LabelInlineEditPopover>
        </LabelSearchRow>
      ))}
    </LabelSearchList>
  );
}

// TopicSearchList와 같은 이유로 마운트 게이팅 — 팝오버가 열렸을 때만 그려진다.
export function TagSearchList(props: TagSearchListProps) {
  return (
    <LabelSearchSection boundaryName="tag-search">
      <Suspense fallback={<LabelSearchSkeleton />}>
        <TagSearchListContent {...props} />
      </Suspense>
    </LabelSearchSection>
  );
}
