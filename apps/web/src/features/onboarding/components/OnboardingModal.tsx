import { useState } from "react";

import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
  type Locale,
} from "@nema-io/shared";
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { Select } from "@web/components/ui/Select";
import { LANGUAGE_LABELS, useUpdateProfile } from "@web/features/profile";
import { useTranslation } from "@web/lib/tolgee";
import { detectLanguage } from "@web/utils/locale";

// UI 언어(Locale)와 콘텐츠 언어(ContentLanguage)는 지금 값 집합(ko/en)이 같아도
// 의미가 다른 별개의 축이다 — 값이 갈릴 때를 대비해 변환을 명시적으로 둔다.
const LOCALE_TO_CONTENT_LANGUAGE: Record<Locale, ContentLanguage> = {
  ko: "ko",
  en: "en",
};

export function OnboardingModal() {
  const { t } = useTranslation();
  // 앱 언어가 이미 detectLanguage()(저장된 값 → 브라우저 언어 → "ko")로 정해지고
  // 있어 같은 기준을 쓴다 — 한국어 브라우저 사용자는 '한국어'가 미리 골라진 채로
  // 모달을 보고 그냥 "시작"만 눌러도 맞다.
  const [selected, setSelected] = useState<ContentLanguage>(
    () => LOCALE_TO_CONTENT_LANGUAGE[detectLanguage()],
  );
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
