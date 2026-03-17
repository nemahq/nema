import { Kbd } from "@nema-io/weave";

import { getAllActionDefs } from "@web/hooks/shortcut/actionMap";
import { useTranslation } from "@web/lib/tolgee";

const IS_MAC = navigator.platform.toUpperCase().includes("MAC");

function formatKey(raw: string): string {
  return raw
    .replace(/\bmod\b/gi, IS_MAC ? "⌘" : "Ctrl")
    .replace(/\bshift\b/gi, IS_MAC ? "⇧" : "Shift")
    .replace(/\balt\b/gi, IS_MAC ? "⌥" : "Alt")
    .replace(/\bmeta\b/gi, "⌘")
    .replace(/\bctrl\b/gi, "Ctrl")
    .replace(/\bescape\b/gi, "Esc");
}

function ShortcutKeys({ shortcut }: { shortcut: string }) {
  const keys = formatKey(shortcut).split("+");
  return (
    <span className="flex gap-1">
      {keys.map((key, i) => (
        <Kbd key={i}>{key}</Kbd>
      ))}
    </span>
  );
}

export function HelpTabContent() {
  const { t } = useTranslation();
  const actions = getAllActionDefs();

  const grouped = actions.reduce<Record<string, (typeof actions)[number][]>>(
    (acc, action) => {
      if (!acc[action.category]) {
        acc[action.category] = [];
      }
      acc[action.category].push(action);
      return acc;
    },
    {},
  );

  return (
    <div className="max-w-sm space-y-6">
      {Object.entries(grouped).map(([category, categoryActions]) => (
        <div key={category}>
          <h3 className="mb-3 text-xs font-medium tracking-wider text-fg-tertiary">
            {t(`shortcut.category_${category}` as Parameters<typeof t>[0])}
          </h3>
          <div className="space-y-1">
            {categoryActions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between rounded px-2 py-1.5"
              >
                <span className="text-sm text-fg-primary">
                  {t(action.labelKey as Parameters<typeof t>[0])}
                </span>
                <ShortcutKeys shortcut={action.shortcut} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
