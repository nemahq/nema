import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Text,
} from "@nema-io/weave";

import { RelativeTime } from "@web/components/ui/RelativeTime";
import { useUpdateReference } from "@web/features/reference/hooks/useUpdateReference";
import type { ReferenceDetail } from "@web/features/reference/types";
import { usePendingAfterDelay } from "@web/hooks/usePendingAfterDelay";
import { useTranslation } from "@web/lib/tolgee";

import { ReferenceTypeBadge } from "./ReferenceTypeBadge";

interface ReferenceEditorProps {
  reference: ReferenceDetail;
  readOnly: boolean;
}

// type·externalUrls는 이 화면에서 편집 대상이 아니지만, update_reference RPC가
// 전체 상태를 받는 계약(생략 = 빈 값으로 변경되는 트랩, reference-service.ts 주석)
// 이라 현재 값을 그대로 실어 되돌려 보낸다.
export function ReferenceEditor({ reference, readOnly }: ReferenceEditorProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"read" | "edit">("read");
  const [titleDraft, setTitleDraft] = useState(reference.title);
  const [bodyDraft, setBodyDraft] = useState(reference.body);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const updateReference = useUpdateReference();
  const isPendingAfterDelay = usePendingAfterDelay(updateReference.isPending);

  function startEdit() {
    setTitleDraft(reference.title);
    setBodyDraft(reference.body);
    setMode("edit");
  }

  function cancelEdit() {
    setMode("read");
  }

  function handleConfirmSubmit() {
    updateReference.mutate(
      {
        referenceId: reference.id,
        type: reference.type,
        title: titleDraft,
        body: bodyDraft,
        externalUrls: reference.externalUrls,
      },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          setMode("read");
        },
      },
    );
  }

  const canSubmit = titleDraft.trim() !== "" && bodyDraft.trim() !== "";

  if (mode === "read") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ReferenceTypeBadge type={reference.type} />
          <Text as="h2" size="lg" weight="bold" className="min-w-0 truncate">
            {reference.title}
          </Text>
          {!readOnly && (
            <Button type="button" variant="ghost" size="xs" onClick={startEdit}>
              {t("reference.edit_action")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Text as="span" size="xs" color="tertiary">
            {t("reference.updated_at_label")}
          </Text>
          <RelativeTime dateTime={reference.updatedAt} />
        </div>
        <Text size="base" color="secondary" className="whitespace-pre-wrap">
          {reference.body}
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Text size="xs" color="brand" weight="medium">
          {t("reference.editing_indicator")}
        </Text>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="xs" onClick={cancelEdit}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="xs"
            disabled={!canSubmit}
            onClick={() => setConfirmOpen(true)}
          >
            {t("reference.submit_action")}
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ReferenceTypeBadge type={reference.type} />
        <Input
          autoFocus
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          className="min-w-0 flex-1"
        />
      </div>
      {/* weave에 Textarea가 없어(Input은 단일 행 전용) TagAddPopover의 설명
          필드와 같은 raw textarea 스타일을 그대로 재사용 */}
      <textarea
        rows={4}
        value={bodyDraft}
        onChange={(e) => setBodyDraft(e.target.value)}
        className="w-full min-w-0 resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm leading-relaxed focus-visible:border-brand focus-visible:outline-none dark:focus-visible:border-fg-tertiary/70"
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t("reference.edit_confirm_title")}</DialogTitle>
          <Text size="sm" color="secondary">
            {t("reference.edit_confirm_description")}
          </Text>
          <DialogFooter>
            <Button
              type="button"
              variant="neutral"
              onClick={() => setConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleConfirmSubmit}
              disabled={updateReference.isPending}
            >
              {isPendingAfterDelay
                ? t("common.saving")
                : t("reference.submit_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
