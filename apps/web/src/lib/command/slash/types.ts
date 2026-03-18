import type { TranslationKey } from "@web/lib/tolgee";

import type { SlashCommandId } from "./commandMap";

export interface SlashCommand {
  name: SlashCommandId;
  descriptionKey: TranslationKey;
  execute: () => void;
}
