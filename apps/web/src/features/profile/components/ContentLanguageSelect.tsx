import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  ContentLanguageSchema,
} from "@nema-io/shared";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nema-io/weave";

import { Select } from "@web/components/ui/Select";
import { LANGUAGE_LABELS } from "@web/features/profile/constants";

interface ContentLanguageSelectProps {
  value: ContentLanguage;
  onValueChange: (value: ContentLanguage) => void;
  className?: string;
}

export function ContentLanguageSelect({
  value,
  onValueChange,
  className,
}: ContentLanguageSelectProps) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        const parsed = ContentLanguageSchema.safeParse(v);
        if (parsed.success) {
          onValueChange(parsed.data);
        }
      }}
    >
      <SelectTrigger className={className}>
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
  );
}
