import { useState } from "react";

import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
} from "@nema-io/shared";
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

import { LANGUAGE_LABELS, useUpdateProfile } from "@web/features/profile";
import { useTranslation } from "@web/lib/tolgee";

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
          onValueChange={(v) => {
            const parsed = ContentLanguageSchema.safeParse(v);
            if (parsed.success) {
              setSelected(parsed.data);
            }
          }}
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
          {updateMutation.isError && (
            <p className="text-sm text-status-error">
              {t("common.unknown_error")}
            </p>
          )}
          <Button
            onClick={() => updateMutation.mutate({ contentLanguage: selected })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPendingAfterDelay
              ? t("settings.start_pending")
              : t("settings.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
