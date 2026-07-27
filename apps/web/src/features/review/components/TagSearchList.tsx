import { Suspense, useState } from "react";

import {
  type DigestTagDraft,
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
} from "@nema-io/shared";

import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import { useTranslation } from "@web/lib/tolgee";
import {
  buildLabelSearchState,
  isDuplicateLabelName,
} from "@web/utils/labelSearch";

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
  // 신규(id===null) 후보의 이름·설명 수정 — 인덱스로 가리킨다.
  onRenameDraft: (index: number, title: string, description: string) => void;
}

const getTagLabel = (tag: { title: string }) => tag.title;

function TagSearchListContent({
  query,
  tags,
  onSelectExisting,
  onStartCreate,
  onRenameDraft,
}: TagSearchListProps) {
  const { t } = useTranslation();
  const [tagList] = useTagListSuspenseQuery();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
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

  function isRenameDuplicate(nextTitle: string, index: number) {
    const trimmed = nextTitle.trim();
    const original = tags[index]?.title;
    if (trimmed === "" || trimmed === original) {
      return false;
    }
    const activeRegistryTitles = tagList.tags
      .filter((tag) => tag.status === "active")
      .map(getTagLabel);
    const otherTitles = tags
      .filter((_, i) => i !== index)
      .map((tag) => tag.title);
    return isDuplicateLabelName(trimmed, [
      ...activeRegistryTitles,
      ...otherTitles,
    ]);
  }

  // 두 필드를 독립적으로 다룬다 — 하나만 비우거나(설명) 중복이면(이름) 그
  // 필드만 원래 값으로 되돌리고, 유효한 다른 필드의 수정은 살린다.
  function applyAndClose(index: number) {
    const tag = tags[index];
    const rawTitle = editingTitle.trim();
    const title =
      rawTitle === "" || isRenameDuplicate(rawTitle, index)
        ? tag.title
        : rawTitle;
    const description = editingDescription.trim() || tag.description;
    if (title !== tag.title || description !== tag.description) {
      onRenameDraft(index, title, description);
    }
    setEditingIndex(null);
  }

  function handleEditOpenChange(index: number, open: boolean) {
    if (open) {
      setEditingIndex(index);
      setEditingTitle(tags[index].title);
      setEditingDescription(tags[index].description);
      return;
    }
    applyAndClose(index);
  }

  const draftEntries = tags
    .map((tag, index) => ({ tag, index }))
    .filter(
      ({ tag }) =>
        tag.id === null &&
        tag.title.toLowerCase().includes(trimmedQuery.toLowerCase()),
    );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftEntries.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
    >
      {draftEntries.map(({ tag, index }) => (
        <LabelSearchRow
          key={`draft-${index}`}
          label={tag.title}
          attached
          isNew
          editing={editingIndex === index}
          description={tag.description}
          onSelect={() => {
            // 신규 라벨은 이미 첨부돼 있어 다시 고를 필요가 없다 — alreadySelected가
            // 클릭을 막아 이 콜백은 실제로 호출되지 않는다.
          }}
        >
          <LabelInlineEditPopover
            open={editingIndex === index}
            onOpenChange={(open) => handleEditOpenChange(index, open)}
          >
            <LabelTextInput
              autoFocus
              value={editingTitle}
              maxLength={TAG_TITLE_MAX_LENGTH}
              ariaLabel={t("review.tag_create_title_label")}
              invalid={
                editingIndex === index && isRenameDuplicate(editingTitle, index)
              }
              onChange={setEditingTitle}
              onSubmit={() => applyAndClose(index)}
            />
            <LabelTextInput
              value={editingDescription}
              maxLength={TAG_DESCRIPTION_MAX_LENGTH}
              ariaLabel={t("review.tag_create_description_label")}
              onChange={setEditingDescription}
              onSubmit={() => applyAndClose(index)}
            />
          </LabelInlineEditPopover>
        </LabelSearchRow>
      ))}
      {candidates.map((tag) => (
        <LabelSearchRow
          key={tag.id}
          label={tag.title}
          attached={attachedIds.has(tag.id)}
          description={tag.description}
          onSelect={() => onSelectExisting(tag)}
        />
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
