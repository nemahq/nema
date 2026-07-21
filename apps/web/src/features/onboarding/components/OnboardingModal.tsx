import { useState } from "react";

import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
} from "@nema-io/shared";
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import {
  LANGUAGE_LABELS,
  useProfileQuery,
  useUpdateProfile,
} from "@web/features/profile";
import { useTranslation } from "@web/lib/tolgee";

export function OnboardingModal() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ContentLanguage>("en");
  const updateMutation = useUpdateProfile();
  // OnboardingGate가 이미 구독 중인 같은 쿼리다 — 저장 성공 후 이 쿼리가 다시
  // fetch되어 profile이 채워져야 모달이 실제로 닫히므로, 그 재조회가 끝날
  // 때까지 버튼을 계속 잠가둔다.
  const profileQuery = useProfileQuery();

  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("settings.onboarding_title")}</DialogTitle>
          <DialogDescription>
            {t("settings.onboarding_description")}
          </DialogDescription>
        </DialogHeader>

        <Select
          value={selected}
          onValueChange={(v) => {
            const parsed = ContentLanguageSchema.safeParse(v);
            if (parsed.success) {
              setSelected(parsed.data);
            }
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {LANGUAGE_LABELS[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            onClick={() => updateMutation.mutate({ contentLanguage: selected })}
            disabled={updateMutation.isPending || profileQuery.isFetching}
          >
            {updateMutation.isPendingAfterDelay || profileQuery.isFetching
              ? t("settings.start_pending")
              : t("settings.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
