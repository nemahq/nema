import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface SpaceDeleteBlockedFormProps {
  onOpenChange: (open: boolean) => void;
}

export function SpaceDeleteBlockedForm({
  onOpenChange,
}: SpaceDeleteBlockedFormProps) {
  const { t } = useTranslation();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("space.delete_title")}</DialogTitle>
        <DialogDescription>{t("space.delete_last_blocked")}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)}>{t("common.close")}</Button>
      </DialogFooter>
    </>
  );
}
