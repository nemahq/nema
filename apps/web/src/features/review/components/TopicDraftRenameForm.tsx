import { useState } from "react";

import { TOPIC_TITLE_MAX_LENGTH } from "@nema-io/shared";
import { Button, Input } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface TopicDraftRenameFormProps {
  title: string;
  // 배열이 아니라 콜백으로 받는 이유 — 비교 대상 목록은 렌더마다 새로 만들어지는
  // 배열(conventions.md: 원시값 prop 규칙)이라, 매 렌더 새 identity를 만들지
  // 않는 콜백에 그 비교를 감싸 넘긴다. 입력값이 바뀔 때마다(키 입력마다) 이
  // 폼 안에서만 다시 판정해야 해서 부모가 boolean 하나로 미리 계산해 둘 수도
  // 없다(TagCreateForm의 정적 title과 다름).
  isDuplicateTitle: (title: string) => boolean;
  onSubmit: (title: string) => void;
}

// 신규(draft) Topic 자신의 이름만 고친다 — 기존 레지스트리 Topic 인라인 수정은
// 대상이 아니다(PR #506 컨센서스, review-flow.md). 취소 버튼이 없는 이유는
// 팝오버를 그냥 닫으면(바깥 클릭·Escape) 아무것도 안 바뀌기 때문 — 저장은
// 반드시 이 버튼을 눌러야 반영된다(TagCreateForm과 달리 뒤로 갈 화면이 없다).
export function TopicDraftRenameForm({
  title,
  isDuplicateTitle,
  onSubmit,
}: TopicDraftRenameFormProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const trimmedTitle = titleValue.trim();
  const duplicate = isDuplicateTitle(trimmedTitle);
  const submittable = trimmedTitle !== "" && !duplicate;

  function getTitleError() {
    if (trimmedTitle === "") {
      return t("common.name_required");
    }
    if (duplicate) {
      return t("common.name_taken");
    }
    return null;
  }
  const titleError = getTitleError();

  function submit() {
    if (submittable) {
      onSubmit(trimmedTitle);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          value={titleValue}
          maxLength={TOPIC_TITLE_MAX_LENGTH}
          aria-label={t("common.name_label")}
          aria-invalid={!submittable}
          onChange={(e) => setTitleValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              submit();
            }
          }}
        />
        <p
          role="alert"
          className={`text-xs ${titleError ? "text-status-error" : "text-transparent"}`}
        >
          {titleError ?? " "}
        </p>
      </div>
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
