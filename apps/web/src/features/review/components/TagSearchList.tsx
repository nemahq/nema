import { Suspense, useState } from "react";

import type { DigestTagDraft } from "@nema-io/shared";

import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import {
  buildDraftRenameExistingLabels,
  buildLabelSearchState,
  filterDraftLabelCandidates,
  isDuplicateLabelName,
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
}

interface TagSearchListProps {
  query: string;
  // TopicSearchList와 같은 이유로 파생값(Set·이름 배열) 대신 원본 배열을 받는다.
  tags: DigestTagDraft[];
  onSelectExisting: (tag: ReviewTag) => void;
  onStartCreate: (title: string) => void;
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
  const [tagList] = useTagListSuspenseQuery();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: tagList.tags,
      getLabel: getTagLabel,
      query,
      existingLabels: tags.map((tag) => tag.title),
    });
  const attachedIds = new Set(tags.map((tag) => tag.id));
  const draftMatches = filterDraftLabelCandidates(tags, query);
  const activeRegistryTitles = tagList.tags
    .filter((tag) => tag.status === "active")
    .map(getTagLabel);

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftMatches.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
    >
      {draftMatches.map(({ item, index }) => (
        <LabelSearchRow
          key={`draft-${index}`}
          label={item.title}
          description={item.description}
          attached
          isNew
          actions={
            <LabelDraftEditPopover
              open={editingIndex === index}
              onOpenChange={(open) => setEditingIndex(open ? index : null)}
            >
              <TagDraftRenameForm
                title={item.title}
                description={item.description}
                isDuplicateTitle={(candidate) =>
                  isDuplicateLabelName(
                    candidate,
                    buildDraftRenameExistingLabels(
                      activeRegistryTitles,
                      tags.map((tag) => tag.title),
                      index,
                    ),
                  )
                }
                onSubmit={(title, description) => {
                  onRenameDraft(index, title, description);
                  setEditingIndex(null);
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
