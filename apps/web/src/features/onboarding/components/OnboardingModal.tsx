import { useState } from "react";

import { type ContentLanguage, type Locale } from "@nema-io/shared";
import {
  Button,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nema-io/weave";

import { Dialog } from "@web/components/ui/Dialog";
import { ContentLanguageSelect, useUpdateProfile } from "@web/features/profile";
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
          <DialogTitle>{t("onboarding.title")}</DialogTitle>
          <DialogDescription>{t("onboarding.description")}</DialogDescription>
        </DialogHeader>

        <ContentLanguageSelect value={selected} onValueChange={setSelected} />

        <DialogFooter>
          <Button
            onClick={() => updateMutation.mutate({ contentLanguage: selected })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPendingAfterDelay
              ? t("onboarding.start_pending")
              : t("onboarding.start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
