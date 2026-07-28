import { Suspense } from "react";

import type { DigestTagDraft } from "@nema-io/shared";

import { useTagListSuspenseQuery } from "@web/hooks/useTagListQuery";
import { buildLabelSearchState } from "@web/utils/labelSearch";

import { LabelSearchList } from "./LabelSearchList";
import { LabelSearchRow } from "./LabelSearchRow";
import { LabelSearchSection } from "./LabelSearchSection";
import { LabelSearchSkeleton } from "./LabelSearchSkeleton";

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
}

const getTagLabel = (tag: { title: string }) => tag.title;

function TagSearchListContent({
  query,
  tags,
  onSelectExisting,
  onStartCreate,
}: TagSearchListProps) {
  const [tagList] = useTagListSuspenseQuery();

  const { candidates, trimmedQuery, hasExactMatch, canCreate } =
    buildLabelSearchState({
      items: tagList.tags,
      getLabel: getTagLabel,
      query,
      existingLabels: tags.map((tag) => tag.title),
    });
  const attachedIds = new Set(tags.map((tag) => tag.registryId));

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0}
      hasExactMatch={hasExactMatch}
      canCreate={canCreate}
      onStartCreate={onStartCreate}
    >
      {candidates.map((tag) => (
        <LabelSearchRow
          key={tag.id}
          label={tag.title}
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
