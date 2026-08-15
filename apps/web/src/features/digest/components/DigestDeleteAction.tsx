import { DeleteConfirmAction } from "@web/components/ui/DeleteConfirmAction";
import { useDeleteDigest } from "@web/features/digest/hooks/useDeleteDigest";
import { useTranslation } from "@web/lib/tolgee";

interface DigestDeleteActionProps {
  // 상세 헤더는 조회(digest.get) 페칭과 분리돼 있어, 그 응답이 아직 없는 동안은
  // 삭제에 쓸 내부 id도 없다(DigestDetailPanel 참고) — 그 구간엔 undefined.
  digestId: string | undefined;
  onDeleted: () => void;
}

// 되살리는 화면이 없어 사용자에게는 영구 삭제다 — 확인 문구도 그렇게 말한다.
export function DigestDeleteAction({
  digestId,
  onDeleted,
}: DigestDeleteActionProps) {
  const { t } = useTranslation();
  const deleteDigest = useDeleteDigest();

  function handleConfirm(closeDialog: () => void) {
    if (!digestId) {
      return;
    }
    deleteDigest.mutate(
      { digestId },
      {
        onSuccess: () => {
          closeDialog();
          onDeleted();
        },
      },
    );
  }

  return (
    <DeleteConfirmAction
      confirmTitle={t("digest.delete_confirm_title")}
      confirmDescription={t("digest.delete_confirm_description")}
      isPending={deleteDigest.isPending}
      isPendingAfterDelay={deleteDigest.isPendingAfterDelay}
      disabled={digestId === undefined}
      onConfirm={handleConfirm}
    />
  );
}
