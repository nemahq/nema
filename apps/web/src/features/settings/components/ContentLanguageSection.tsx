import { Suspense, useEffect, useId, useState } from "react";

import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
} from "@nema-io/shared";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { LANGUAGE_LABELS } from "@web/features/profile";
import { useProfileSuspenseQuery } from "@web/features/profile/hooks/useProfile";
import { useTranslation } from "@web/lib/tolgee";

interface ContentLanguageSectionProps {
  onChange: (value: ContentLanguage) => void;
}

function ContentLanguageSectionInner({
  onChange,
}: ContentLanguageSectionProps) {
  const { t } = useTranslation();
  const contentLangId = useId();
  const [profile] = useProfileSuspenseQuery();

  const [contentLang, setContentLang] = useState<ContentLanguage>(
    () => profile?.contentLanguage ?? "ko",
  );

  useEffect(function notifyInitialValue() {
    onChange(contentLang);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 마운트 시 1회 초기값 전달

  function handleChange(v: string) {
    const parsed = ContentLanguageSchema.safeParse(v);
    if (parsed.success) {
      setContentLang(parsed.data);
      onChange(parsed.data);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={contentLangId}
        className="text-sm font-medium text-fg-primary"
      >
        {t("settings.content_language")}
      </label>
      <p className="text-xs text-fg-tertiary">
        {t("settings.content_language_description")}
      </p>
      <Select value={contentLang} onValueChange={handleChange}>
        <SelectTrigger id={contentLangId} className="cursor-pointer">
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
    </div>
  );
}

export function ContentLanguageSection(props: ContentLanguageSectionProps) {
  return (
    <Suspense>
      <ContentLanguageSectionInner {...props} />
    </Suspense>
  );
}
