import { useState } from "react";

import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@nema-io/weave";
import { MoreHorizontal } from "@nema-io/weave/icons";

import { Dialog } from "@web/components/ui/Dialog";
import { DropdownMenu } from "@web/components/ui/DropdownMenu";
import { useDeleteSource } from "@web/features/source/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface SourceDeleteMenuProps {
  sourceId: string;
  onDeleted: () => void;
}

// 미트볼 → 드롭다운 → 확인 다이얼로그. 하드 삭제 + CASCADE라 되돌릴 수 없다 —
// legacy의 ReferenceDetailMoreMenu와 같은 모양(reference.archive_action 대신
// 원문 삭제).
export function SourceDeleteMenu({
  sourceId,
  onDeleted,
}: SourceDeleteMenuProps) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteSource = useDeleteSource();

  function handleConfirmDelete() {
    deleteSource.mutate(
      { sourceId },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          onDeleted();
        },
      },
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
            aria-label={t("common.more_actions")}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setConfirmOpen(true)}>
            {t("common.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("source.delete_confirm_title")}</DialogTitle>
            <DialogDescription>
              {t("source.delete_confirm_description")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDelete}
              disabled={deleteSource.isPending}
            >
              {deleteSource.isPendingAfterDelay
                ? t("common.deleting")
                : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
