import { useState } from "react";

import {
  TAG_DESCRIPTION_MAX_LENGTH,
  TAG_TITLE_MAX_LENGTH,
} from "@nema-io/shared";
import { Button, Input, Textarea } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";
import { isDuplicateLabelName } from "@web/utils/labelSearch";

interface TagDraftRenameFormProps {
  title: string;
  description: string;
  existingLabels: string[];
  onSubmit: (title: string, description: string) => void;
}

// TopicDraftRenameForm과 같은 스코프(신규 Tag 자신만) — Tag는 description도
// 재사용 판단 기준(07-modeling.md)이라 이름과 같이 고칠 수 있어야 한다.
export function TagDraftRenameForm({
  title,
  description,
  existingLabels,
  onSubmit,
}: TagDraftRenameFormProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const [descriptionValue, setDescriptionValue] = useState(description);
  const trimmedTitle = titleValue.trim();
  const trimmedDescription = descriptionValue.trim();
  const duplicateTitle = isDuplicateLabelName(trimmedTitle, existingLabels);
  const titleInvalid = trimmedTitle === "" || duplicateTitle;
  const descriptionInvalid = trimmedDescription === "";
  const submittable = !titleInvalid && !descriptionInvalid;

  function submit() {
    if (submittable) {
      onSubmit(trimmedTitle, trimmedDescription);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={titleValue}
        maxLength={TAG_TITLE_MAX_LENGTH}
        aria-label={t("review.tag_create_title_label")}
        aria-invalid={titleInvalid}
        onChange={(e) => setTitleValue(e.target.value)}
      />
      <Textarea
        value={descriptionValue}
        maxLength={TAG_DESCRIPTION_MAX_LENGTH}
        aria-label={t("review.tag_create_description_label")}
        aria-invalid={descriptionInvalid}
        onChange={(e) => setDescriptionValue(e.target.value)}
        rows={3}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          size="xs"
          disabled={!submittable}
          onClick={submit}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
