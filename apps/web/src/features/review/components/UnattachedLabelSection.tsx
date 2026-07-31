import { Chip, Text } from "@nema-io/weave";

import type { ReviewDraft } from "@web/features/review/reviewDraft";
import { useTranslation } from "@web/lib/tolgee";

import { useReviewDraftContext } from "./ReviewDraftProvider";

interface UnattachedLabelSectionProps {
  digests: ReviewDraft["digests"];
  labelDraft: ReviewDraft["labelDraft"];
  disabled: boolean;
}

// #28 — 어디에도 안 붙은 팔레트 항목은 존재는 남지만(다른 후보로 옮길 수 있게)
// 그 사실을 볼 곳이 없다(각 digest는 자기가 붙인 것만 보여준다). 경고 모달 없이
// 여기 조용히 남겨 ambient 상태로만 알린다(확정 시 레지스트리에 안 쓰임) —
// opacity로만 구분하고 눌러도 확인창 없이 팔레트에서 바로 지운다.
export function UnattachedLabelSection({
  digests,
  labelDraft,
  disabled,
}: UnattachedLabelSectionProps) {
  const { t } = useTranslation();
  const { dispatch } = useReviewDraftContext();

  const attachedTopicIds = new Set(digests.flatMap((digest) => digest.topics));
  const attachedTagIds = new Set(digests.flatMap((digest) => digest.tags));
  const unattachedTopics = labelDraft.topics.filter(
    (topic) => !attachedTopicIds.has(topic.id),
  );
  const unattachedTags = labelDraft.tags.filter(
    (tag) => !attachedTagIds.has(tag.id),
  );

  if (unattachedTopics.length + unattachedTags.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Text as="h2" size="sm" weight="semibold" color="secondary">
        {t("review.unattached_label_section_title", {
          count: unattachedTopics.length + unattachedTags.length,
        })}
      </Text>
      <div className="flex flex-wrap items-center gap-1 opacity-60">
        {unattachedTopics.map((topic) => (
          <Chip
            key={topic.id}
            variant="outline"
            shape="rounded"
            truncated
            disabled={disabled}
            onRemove={() =>
              dispatch({ type: "label/removeTopic", id: topic.id })
            }
            removeAriaLabel={t("review.topic_remove_action", {
              label: topic.title,
            })}
          >
            {topic.title}
          </Chip>
        ))}
        {unattachedTags.map((tag) => (
          <Chip
            key={tag.id}
            color={tag.color}
            shape="rounded"
            truncated
            disabled={disabled}
            onRemove={() => dispatch({ type: "label/removeTag", id: tag.id })}
            removeAriaLabel={t("review.tag_remove_action")}
          >
            {tag.title}
          </Chip>
        ))}
      </div>
    </div>
  );
}
