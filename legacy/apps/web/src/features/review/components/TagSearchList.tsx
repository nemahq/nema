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
  // TopicSearchList와 같은 이유 — 상한에 닿으면 레지스트리 후보·만들기는
  // 숨기고, 이미 붙은 신규 라벨만 남겨 미트볼(삭제)에는 계속 닿게 한다.
  atMax: boolean;
  onSelectExisting: (tag: ReviewTag) => void;
  onStartCreate: (title: string) => void;
  onRenameDraft: (
    id: string,
    title: string,
    description: string,
    color: TagColor,
  ) => void;
  onDeleteDraft: (id: string) => void;
}

const getTagLabel = (tag: { title: string }) => tag.title;

// TopicSearchList와 같은 정렬 정체성(그쪽 TopicSearchRow 주석 참고).
type TagSearchRow =
  | { kind: "draft"; tag: ReviewTagDraft; attached: boolean }
  | { kind: "candidate"; tag: ReviewTag; attached: boolean };

function TagSearchListContent({
  query,
  attachedTags,
  paletteTags,
  createPreviewColor,
  atMax,
  onSelectExisting,
  onStartCreate,
  onRenameDraft,
  onDeleteDraft,
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

  // TopicSearchList와 같은 이유 — 상한에 닿으면 레지스트리 후보는 숨기고,
  // 이미 붙은 신규 라벨만 남긴다.
  const visibleDraftMatches = atMax
    ? draftMatches.filter((draft) => attachedIds.has(draft.id))
    : draftMatches;
  const visibleCandidates = atMax ? [] : candidates;

  const rows: TagSearchRow[] = [
    ...visibleDraftMatches.map(
      (draft): TagSearchRow => ({
        kind: "draft",
        tag: draft,
        attached: attachedIds.has(draft.id),
      }),
    ),
    ...visibleCandidates.map(
      (tag): TagSearchRow => ({
        kind: "candidate",
        tag,
        attached: attachedIds.has(tag.id),
      }),
    ),
  ];
  // TopicSearchList와 같은 정렬 규칙(붙음 1차, 신규 2차, stable).
  const sortedRows = [...rows].sort(
    (a, b) =>
      (a.attached ? 0 : 1) - (b.attached ? 0 : 1) ||
      (a.kind === "draft" ? 0 : 1) - (b.kind === "draft" ? 0 : 1),
  );

  return (
    <LabelSearchList
      trimmedQuery={trimmedQuery}
      hasCandidates={sortedRows.length > 0}
      canCreate={atMax ? false : canCreate}
      createPreviewColor={createPreviewColor}
      onStartCreate={onStartCreate}
    >
      {sortedRows.map((row) =>
        row.kind === "draft" ? (
          <LabelSearchRow
            key={row.tag.id}
            label={row.tag.title}
            description={row.tag.description}
            color={row.tag.color}
            attached={row.attached}
            isNew
            onSelect={() => onSelectExisting(row.tag)}
            actions={
              <LabelDraftEditPopover
                open={editingId === row.tag.id}
                onOpenChange={(open) => setEditingId(open ? row.tag.id : null)}
              >
                <TagDraftRenameForm
                  title={row.tag.title}
                  description={row.tag.description}
                  color={row.tag.color}
                  isDuplicateTitle={buildDraftRenameDuplicateCheck({
                    registryLabels: activeRegistryTitles,
                    digestLabels: paletteTags,
                    excludeId: row.tag.id,
                  })}
                  onCommitText={(title, description) =>
                    onRenameDraft(row.tag.id, title, description, row.tag.color)
                  }
                  onColorChange={(color) =>
                    onRenameDraft(
                      row.tag.id,
                      row.tag.title,
                      row.tag.description,
                      color,
                    )
                  }
                  onDelete={() => onDeleteDraft(row.tag.id)}
                />
              </LabelDraftEditPopover>
            }
          />
        ) : (
          <LabelSearchRow
            key={row.tag.id}
            label={row.tag.title}
            description={row.tag.description}
            color={row.tag.color}
            attached={row.attached}
            onSelect={() => onSelectExisting(row.tag)}
          />
        ),
      )}
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
