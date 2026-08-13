import { DeleteConfirmMenu } from "@web/components/ui/DeleteConfirmMenu";
import { useDeleteSource } from "@web/features/source/hooks/useDeleteSource";
import { useTranslation } from "@web/lib/tolgee";

interface SourceDeleteMenuProps {
  sourceId: string;
  onDeleted: () => void;
}

// 하드 삭제 + CASCADE라 되돌릴 수 없다 — 확인 문구가 그 사실을 말한다.
export function SourceDeleteMenu({
  sourceId,
  onDeleted,
}: SourceDeleteMenuProps) {
  const { t } = useTranslation();
  const deleteSource = useDeleteSource();

  function handleConfirm(closeDialog: () => void) {
    deleteSource.mutate(
      { sourceId },
      {
        onSuccess: () => {
          closeDialog();
          onDeleted();
        },
      },
    );
  }

  return (
    <DeleteConfirmMenu
      confirmTitle={t("source.delete_confirm_title")}
      confirmDescription={t("source.delete_confirm_description")}
      isPending={deleteSource.isPending}
      isPendingAfterDelay={deleteSource.isPendingAfterDelay}
      onConfirm={handleConfirm}
    />
  );
}
