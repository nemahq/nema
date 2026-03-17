import type { TranslationKey } from "@web/lib/tolgee";

export interface SlashCommand {
  name: string;
  descriptionKey: TranslationKey;
  execute: () => void;
}
