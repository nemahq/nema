import { Suspense, useState } from "react";

import type { ReviewTagDraft, TagColor } from "@nema-io/shared";

import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import {
  buildDraftRenameDuplicateCheck,
  buildLabelSearchState,
  filterDraftLabelCandidates,
  getActiveLabelTitles,
} from "@web/utils/labelSearch";

import { LabelDraftEditPopover } from "./LabelDraftEditPopover";
import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";
import { TagDraftRenameForm } from "./TagDraftRenameForm";

interface ReviewTag {
  id: string;
  title: string;
  description: string;
  color: TagColor;
}

interface TagSearchListProps {
  query: string;
  // TopicSearchList와 같은 이유로 파생값(Set·이름 배열) 대신 원본 배열을 받는다.
  tags: ReviewTagDraft[];
  onSelectExisting: (tag: ReviewTag) => void;
  onStartCreate: (title: string) => void;
  onRenameDraft: (
    id: string,
    title: string,
    description: string,
    color: TagColor,
  ) => void;
}

const getTagLabel = (tag: { title: string }) => tag.title;

function TagSearchListContent({
  query,
  tags,
  onSelectExisting,
  onStartCreate,
  onRenameDraft,
}: TagSearchListProps) {
  const [tagList] = useTagListSuspenseQuery();
  // 한 번에 하나만 편집 — 이미 열린 걸 그대로 두면 두 편집이 같은 tags 배열을
  // 동시에 patch하려다 서로의 변경을 덮어쓸 수 있다.
  const [editingId, setEditingId] = useState<string | null>(null);

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: tagList.tags,
      getLabel: getTagLabel,
      query,
      existingLabels: tags.map((tag) => tag.title),
    });
  const attachedIds = new Set(tags.map((tag) => tag.registryId));
  const draftMatches = filterDraftLabelCandidates(tags, query);
  const activeRegistryTitles = getActiveLabelTitles(tagList.tags, getTagLabel);

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftMatches.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
    >
      {draftMatches.map((draft) => (
        <LabelSearchRow
          key={draft.id}
          label={draft.title}
          description={draft.description}
          attached
          isNew
          actions={
            <LabelDraftEditPopover
              open={editingId === draft.id}
              onOpenChange={(open) => setEditingId(open ? draft.id : null)}
            >
              <TagDraftRenameForm
                title={draft.title}
                description={draft.description}
                color={draft.color}
                isDuplicateTitle={buildDraftRenameDuplicateCheck({
                  registryLabels: activeRegistryTitles,
                  digestLabels: tags,
                  excludeId: draft.id,
                })}
                onSubmit={(title, description, color) => {
                  onRenameDraft(draft.id, title, description, color);
                  setEditingId(null);
                }}
              />
            </LabelDraftEditPopover>
          }
        />
      ))}
      {candidates.map((tag) => (
        <LabelSearchRow
          key={tag.id}
          label={tag.title}
          description={tag.description}
          attached={attachedIds.has(tag.id)}
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
