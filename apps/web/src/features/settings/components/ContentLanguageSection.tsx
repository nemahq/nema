import { useId } from "react";

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
import { useTranslation } from "@web/lib/tolgee";

interface ContentLanguageSectionProps {
  value: ContentLanguage;
  onChange: (value: ContentLanguage) => void;
}

export function ContentLanguageSection({
  value,
  onChange,
}: ContentLanguageSectionProps) {
  const { t } = useTranslation();
  const contentLangId = useId();

  function handleChange(v: string) {
    const parsed = ContentLanguageSchema.safeParse(v);
    if (parsed.success) {
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
      <Select value={value} onValueChange={handleChange}>
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
