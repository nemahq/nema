import { useEffect, useRef, useState } from "react";

import { TOPIC_TITLE_MAX_LENGTH } from "@nema-io/shared";
import {
  ComboboxItem,
  FormControl,
  FormField,
  FormMessage,
  Input,
  Separator,
} from "@nema-io/weave";
import { Trash2 } from "@nema-io/weave/icons";

import { useTranslation } from "@web/lib/tolgee";

interface TopicDraftRenameFormProps {
  title: string;
  // 배열이 아니라 콜백으로 받는 이유 — 비교 대상 목록은 conventions.md 원시값
  // prop 규칙상 배열로 못 받는다(콜백은 예외). 입력값이 바뀔 때마다(키 입력마다)
  // 이 폼 안에서만 다시 판정해야 해서 부모가 boolean 하나로 미리 계산해 둘 수도
  // 없다(TagCreateForm의 정적 title과 다름).
  isDuplicateTitle: (title: string) => boolean;
  // 저장 버튼이 없다 — 팝오버가 닫힐 때(바깥 클릭 등)만 유효한 값이 커밋된다
  // (TagDraftRenameForm과 같은 원칙).
  onCommitText: (title: string) => void;
  // 신규 라벨 자신을 팔레트에서 완전히 지운다(label/removeTopic) — 레지스트리
  // 기존 Topic엔 이 진입점 자체가 없다(PR #506 컨센서스).
  onDelete: () => void;
}

// 신규(draft) Topic 자신의 이름만 고친다 — 기존 레지스트리 Topic 인라인 수정은
// 대상이 아니다(PR #506 컨센서스, review-flow.md).
export function TopicDraftRenameForm({
  title,
  isDuplicateTitle,
  onCommitText,
  onDelete,
}: TopicDraftRenameFormProps) {
  const { t } = useTranslation();
  const [titleValue, setTitleValue] = useState(title);
  const trimmedTitle = titleValue.trim();
  const duplicate = isDuplicateTitle(trimmedTitle);
  const submittable = trimmedTitle !== "" && !duplicate;

  // TagDraftRenameForm과 같은 언마운트-커밋 패턴 — 상세 이유(초깃값과 비교해 실제
  // 변경 시에만 커밋하는 이유 포함)는 그쪽 주석 참고.
  const [initialTitle] = useState(title);
  const latestRef = useRef({ trimmedTitle, submittable, onCommitText });
  useEffect(function syncLatest() {
    latestRef.current = { trimmedTitle, submittable, onCommitText };
  });
  // 삭제로 이 팝오버가 닫힐 때도 같은 언마운트 커밋 effect가 돈다 — 그대로 두면
  // 이미 팔레트에서 지워진 id로 label/renameTopic이 한 번 더 나가, 리듀서에선
  // no-op이지만(map이 대상을 못 찾음) undo 스택엔 그 no-op까지 스냅샷 한 칸을
  // 더 먹어(ReviewDraftProvider의 dispatch는 결과와 무관하게 항상 push) 삭제
  // 하나를 되돌리려면 실행취소를 두 번 눌러야 하는 게 된다. 삭제 클릭 시점에
  // 동기로 세워두는 이 ref가 커밋을 막는다.
  const deletingRef = useRef(false);
  useEffect(
    function commitOnClose() {
      return () => {
        if (deletingRef.current) {
          return;
        }
        const latest = latestRef.current;
        const changed = latest.trimmedTitle !== initialTitle;
        if (latest.submittable && changed) {
          latest.onCommitText(latest.trimmedTitle);
        }
      };
    },
    [initialTitle],
  );

  function handleDelete() {
    deletingRef.current = true;
    onDelete();
  }

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

  return (
    <>
      <FormField className="px-2">
        <FormControl>
          <Input
            autoFocus
            value={titleValue}
            maxLength={TOPIC_TITLE_MAX_LENGTH}
            placeholder={t("common.name_placeholder")}
            aria-label={t("common.name_label")}
            aria-invalid={!submittable}
            onChange={(e) => setTitleValue(e.target.value)}
          />
        </FormControl>
        <FormMessage reserveSpace errorPrefix={t("common.error_prefix")}>
          {titleError}
        </FormMessage>
      </FormField>
      <Separator />
      <ComboboxItem
        onClick={handleDelete}
        buttonClassName="gap-2 text-status-error [&_svg]:text-status-error"
      >
        <Trash2 className="size-4" />
        {t("common.delete")}
      </ComboboxItem>
    </>
  );
}
