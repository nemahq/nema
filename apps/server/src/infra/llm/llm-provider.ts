import type { z } from "zod";

/** Conversation message. "system" is excluded — use systemPrompt param instead. */
export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateStructuredParams<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  systemPrompt: string;
  messages: [LlmMessage, ...LlmMessage[]];
  model?: string;
  temperature?: number;
}

export interface LlmProvider {
  /** @throws {LlmError} on any LLM call failure */
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
}
