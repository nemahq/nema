import { IS_MAC } from "@web/utils/platform";

type ModifierKey = "mod" | "shift" | "alt" | "meta" | "ctrl" | "escape";

const MODIFIER_PATTERN = new RegExp(
  `\\b(${(["mod", "shift", "alt", "meta", "ctrl", "escape"] satisfies ModifierKey[]).join("|")})\\b`,
  "gi",
);

const KEY_LABELS: Record<ModifierKey, string> = IS_MAC
  ? { mod: "⌘", shift: "⇧", alt: "⌥", meta: "⌘", ctrl: "Ctrl", escape: "Esc" }
  : {
      mod: "Ctrl",
      shift: "Shift",
      alt: "Alt",
      meta: "⌘",
      ctrl: "Ctrl",
      escape: "Esc",
    };

function formatKey(raw: string): string {
  return raw.replace(
    MODIFIER_PATTERN,
    (match) => KEY_LABELS[match.toLowerCase() as ModifierKey],
  );
}

export function formatKeySegments(shortcut: string): string[] {
  return formatKey(shortcut).split("+");
}
