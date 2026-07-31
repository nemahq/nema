import { SPACE_NAME_MAX_LENGTH } from "@nema-io/shared";
import {
  FormControl,
  FormField,
  FormLabel,
  FormMessage,
  Input,
} from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface SpaceNameFieldProps {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  error: string | null;
  hasConflict: boolean;
}

export function SpaceNameField({
  value,
  onChange,
  onEnter,
  error,
  hasConflict,
}: SpaceNameFieldProps) {
  const { t } = useTranslation();

  return (
    <FormField>
      <FormLabel>{t("space.name_placeholder")}</FormLabel>
      <FormControl>
        <Input
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onEnter();
            }
          }}
          maxLength={SPACE_NAME_MAX_LENGTH}
          aria-invalid={Boolean(error) || hasConflict}
        />
      </FormControl>
      <FormMessage reserveSpace errorPrefix={t("common.error_prefix")}>
        {error}
      </FormMessage>
    </FormField>
  );
}
