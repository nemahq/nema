import { SPACE_NAME_MAX_LENGTH } from "@nema-io/shared";
import { Input, Text } from "@nema-io/weave";

import { useTranslation } from "@web/lib/tolgee";

interface SpaceNameFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  error: string | null;
  hasConflict: boolean;
}

export function SpaceNameField({
  id,
  value,
  onChange,
  onEnter,
  error,
  hasConflict,
}: SpaceNameFieldProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5">
      <Text as="label" htmlFor={id} size="sm" weight="medium" color="primary">
        {t("space.name_placeholder")}
      </Text>
      <Input
        id={id}
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
      <p
        role="alert"
        className={`px-3 text-xs ${error ? "text-status-error" : "text-transparent"}`}
      >
        {error ?? " "}
      </p>
    </div>
  );
}
