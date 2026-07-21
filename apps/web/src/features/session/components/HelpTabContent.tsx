import { Kbd, Text } from "@nema-io/weave";

import { getAllActionDefs } from "@web/lib/command/shortcut/actionMap";
import { formatKeySegments } from "@web/lib/command/shortcut/formatKey";
import { useTranslation } from "@web/lib/tolgee";

interface ShortcutKeysProps {
  shortcut: string;
}

function ShortcutKeys({ shortcut }: ShortcutKeysProps) {
  return (
    <span className="flex gap-1">
      {formatKeySegments(shortcut).map((key, i) => (
        <Kbd key={i}>{key}</Kbd>
      ))}
    </span>
  );
}

const GROUPED_ACTIONS = getAllActionDefs().reduce<
  Record<string, ReturnType<typeof getAllActionDefs>>
>((acc, action) => {
  if (!acc[action.category]) {
    acc[action.category] = [];
  }
  acc[action.category].push(action);
  return acc;
}, {});

export function HelpTabContent() {
  const { t } = useTranslation();

  return (
    <div className="max-w-sm space-y-6">
      {Object.entries(GROUPED_ACTIONS).map(([category, categoryActions]) => (
        <div key={category}>
          <Text
            as="h3"
            size="xs"
            weight="medium"
            color="tertiary"
            className="mb-3"
          >
            {t(`shortcut.category_${category}` as Parameters<typeof t>[0])}
          </Text>
          <div className="space-y-1">
            {categoryActions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between rounded px-2 py-1.5"
              >
                <Text as="span" size="sm" color="primary">
                  {t(action.labelKey)}
                </Text>
                <ShortcutKeys shortcut={action.shortcut} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
