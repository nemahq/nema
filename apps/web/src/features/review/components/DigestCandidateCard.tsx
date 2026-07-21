import { memo } from "react";

import { DIGEST_TITLE_MAX_LENGTH } from "@nema-io/shared";
import {
  Button,
  cn,
  Input,
  NESTED_HOVER_ICON_CLASSNAME,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import type {
  ReviewCitedReference,
  ReviewDigest,
} from "@web/features/review/types";
import { useTranslation } from "@web/lib/tolgee";

import { CitedReferenceBadges } from "./CitedReferenceBadges";
import { DigestBodyFields } from "./DigestBodyFields";
import { DigestTypeSelect } from "./DigestTypeSelect";
import { useEditing } from "./EditingProvider";
import { TagChipRow } from "./TagChipRow";
import { TopicChipRow } from "./TopicChipRow";

interface DigestCandidateCardProps {
  index: number;
  // 쿼리 캐시에서 그대로 온 원본이라 참조가 안정적이다 — memo의 얕은 비교가 먹는다.
  digest: ReviewDigest;
  citedReferences: ReviewCitedReference[];
  disabled: boolean;
}

// 자기 index의 편집값만 구독한다 — 다른 카드를 고쳐도 여기 selector 결과가 그대로라
// 리렌더되지 않는다. dispatch는 store에서 직접 꺼내므로 콜백 prop이 없고, 그래서
// props가 전부 안정적이라 memo가 실제로 동작한다.
export const DigestCandidateCard = memo(function DigestCandidateCard({
  index,
  digest,
  citedReferences,
  disabled,
}: DigestCandidateCardProps) {
  const { t } = useTranslation();
  const dispatch = useEditing((state) => state.dispatch);
  const title =
    useEditing((state) => state.overrides.titleOverrides.get(index)) ??
    digest.title;
  const body =
    useEditing((state) => state.overrides.bodyOverrides.get(index)) ??
    digest.body;
  const topics =
    useEditing((state) => state.overrides.topicsOverrides.get(index)) ??
    digest.topics;
  const tags =
    useEditing((state) => state.overrides.tagsOverrides.get(index)) ??
    digest.tags;

  return (
    <div className="group flex flex-col gap-3 rounded-lg border border-border/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <DigestTypeSelect
            bodyType={body.type}
            disabled={disabled}
            onChange={(next) =>
              dispatch({ type: "digest/setBody", index, body: next })
            }
          />
          <Input
            value={title}
            onChange={(e) =>
              dispatch({
                type: "digest/setTitle",
                index,
                title: e.target.value,
              })
            }
            disabled={disabled}
            maxLength={DIGEST_TITLE_MAX_LENGTH}
            placeholder={t("review.digest_title_placeholder")}
            aria-invalid={title.trim() === ""}
            className="h-auto border-transparent bg-transparent px-0 py-1 text-xl font-semibold shadow-none"
          />
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={disabled}
              aria-label={t("common.delete")}
              onClick={() => dispatch({ type: "digest/remove", index })}
              className={cn(
                "size-6 rounded-full text-fg-tertiary opacity-0 transition-none group-hover:opacity-100 focus-visible:opacity-100",
                NESTED_HOVER_ICON_CLASSNAME,
              )}
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={3}>
            {t("common.delete")}
          </TooltipContent>
        </Tooltip>
      </div>

      <p className="text-sm text-fg-tertiary">{digest.description}</p>

      <DigestBodyFields body={body} />

      <TopicChipRow
        topics={topics}
        disabled={disabled}
        onChange={(next) =>
          dispatch({ type: "digest/setTopics", index, topics: next })
        }
      />

      <TagChipRow
        tags={tags}
        disabled={disabled}
        onChange={(next) =>
          dispatch({ type: "digest/setTags", index, tags: next })
        }
      />

      <CitedReferenceBadges
        referenceIds={digest.referenceIds}
        citedReferences={citedReferences}
      />
    </div>
  );
});
