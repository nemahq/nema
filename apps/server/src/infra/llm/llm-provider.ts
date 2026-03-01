import type { z } from "zod";

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateStructuredParams<T> {
  schema: z.ZodType<T>;
  schemaName: string;
  systemPrompt: string;
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
}

export interface LlmProvider {
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
}
