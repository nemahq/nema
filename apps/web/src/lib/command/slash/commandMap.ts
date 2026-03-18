import type { TranslationKey } from "@web/lib/tolgee";

interface SlashCommandDef {
  descriptionKey: TranslationKey;
}

const commandMap = {
  help: { descriptionKey: "session.help_description" },
} satisfies Record<string, SlashCommandDef>;

export type SlashCommandId = keyof typeof commandMap;

export function getCommandDef(id: SlashCommandId): SlashCommandDef {
  return commandMap[id];
}

export function getAllCommandIds(): SlashCommandId[] {
  return Object.keys(commandMap) as SlashCommandId[];
}
