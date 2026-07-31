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
  // 지금 이 Digest에 붙은 Tag — "붙음" 표시 판정에만 쓴다.
  attachedTags: ReviewTagDraft[];
  // 리뷰 팔레트 전체(#28) — draft 후보(다른 Digest가 이미 만든 라벨 포함)와
  // 중복 이름 판정 풀은 이제 이 Digest 하나가 아니라 리뷰 전체를 본다.
  paletteTags: ReviewTagDraft[];
  // "만들기" 미리보기 Badge에 씌울 색 — TagEditPanel이 TagCreateForm과 공유하는
  // 값을 그대로 받아 넘긴다(TagCreateForm.tsx의 initialColor 주석 참고).
  createPreviewColor: TagColor;
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
  attachedTags,
  paletteTags,
  createPreviewColor,
  onSelectExisting,
  onStartCreate,
  onRenameDraft,
}: TagSearchListProps) {
  const [tagList] = useTagListSuspenseQuery();
  // 한 번에 하나만 편집 — 이미 열린 걸 그대로 두면 두 편집이 같은 팔레트를
  // 동시에 patch하려다 서로의 변경을 덮어쓸 수 있다.
  const [editingId, setEditingId] = useState<string | null>(null);

  const { candidates, trimmedQuery, canCreate } = buildLabelSearchState({
    items: tagList.tags,
    getLabel: getTagLabel,
    query,
    existingLabels: paletteTags.map((tag) => tag.title),
  });
  const attachedIds = new Set(attachedTags.map((tag) => tag.id));
  const draftMatches = filterDraftLabelCandidates(paletteTags, query);
  const activeRegistryTitles = getActiveLabelTitles(tagList.tags, getTagLabel);
  // 이미 붙은 기존 Tag를 후보 목록 맨 앞으로 — DigestTagPicker가 신규를 앞세우는
  // 것과 같은 stable sort 규칙, 여기선 attached 여부가 그 기준이다.
  const sortedCandidates = [...candidates].sort(
    (a, b) => (attachedIds.has(a.id) ? 0 : 1) - (attachedIds.has(b.id) ? 0 : 1),
  );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={candidates.length > 0 || draftMatches.length > 0}
      canCreate={canCreate}
      createPreviewColor={createPreviewColor}
      onStartCreate={onStartCreate}
    >
      {draftMatches.map((draft) => (
        <LabelSearchRow
          key={draft.id}
          label={draft.title}
          description={draft.description}
          color={draft.color}
          attached={attachedIds.has(draft.id)}
          isNew
          onSelect={() => onSelectExisting(draft)}
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
                  digestLabels: paletteTags,
                  excludeId: draft.id,
                })}
                onCommitText={(title, description) =>
                  onRenameDraft(draft.id, title, description, draft.color)
                }
                onColorChange={(color) =>
                  onRenameDraft(draft.id, draft.title, draft.description, color)
                }
              />
            </LabelDraftEditPopover>
          }
        />
      ))}
      {sortedCandidates.map((tag) => (
        <LabelSearchRow
          key={tag.id}
          label={tag.title}
          description={tag.description}
          color={tag.color}
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
