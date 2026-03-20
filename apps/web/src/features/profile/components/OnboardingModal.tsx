import { useState } from "react";

import { CONTENT_LANGUAGES, type ContentLanguage } from "@nema-io/shared";
import {
  Button,
  Dialog,
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

import { useUpdateProfile } from "@web/features/profile/hooks/useUpdateProfile";
import { useTranslation } from "@web/lib/tolgee";

const LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  ko: "한국어",
  en: "English",
};

export function OnboardingModal() {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ContentLanguage>("en");
  const updateMutation = useUpdateProfile();

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
          onValueChange={(v) => setSelected(v as ContentLanguage)}
        >
          <SelectTrigger className="cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTENT_LANGUAGES.map((lang) => (
              <SelectItem key={lang} value={lang} className="cursor-pointer">
                {LANGUAGE_LABELS[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button
            onClick={() => updateMutation.mutate({ contentLanguage: selected })}
            disabled={updateMutation.isPending}
          >
            {t("settings.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
