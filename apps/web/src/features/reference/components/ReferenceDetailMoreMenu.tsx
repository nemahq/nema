import { useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Text,
} from "@nema-io/weave";
import { MoreHorizontal } from "@nema-io/weave/icons";

import { useArchiveReference } from "@web/features/reference/hooks/useArchiveReference";
import { useTranslation } from "@web/lib/tolgee";

interface ReferenceDetailMoreMenuProps {
  referenceId: string;
}

// 활성 상태에서만 노출된다 — 아카이브된 뒤 상태는 ReferenceArchivedBanner가
// 표시(되살리기는 BE에 restore RPC가 없어 이번 슬라이스엔 없음).
export function ReferenceDetailMoreMenu({
  referenceId,
}: ReferenceDetailMoreMenuProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const archiveReference = useArchiveReference();

  function handleConfirmArchive() {
    archiveReference.mutate(
      { referenceId },
      { onSuccess: () => setConfirmOpen(false) },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("reference.more_actions_label")}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
            {t("reference.archive_action")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle>{t("reference.archive_confirm_title")}</DialogTitle>
          <Text size="sm" color="secondary">
            {t("reference.archive_confirm_description")}
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
              variant="danger"
              onClick={handleConfirmArchive}
              disabled={archiveReference.isPending}
            >
              {archiveReference.isPendingAfterDelay
                ? t("common.saving")
                : t("reference.archive_action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
