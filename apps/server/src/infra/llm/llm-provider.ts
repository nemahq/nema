import type { z } from "zod";

// "system"은 systemPrompt 파라미터로 별도 전달하므로 role에서 제외
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

export interface GenerateStreamParams {
  systemPrompt: string;
  messages: [LlmMessage, ...LlmMessage[]];
  model?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  generateStructured<T>(params: GenerateStructuredParams<T>): Promise<T>;
  generateStream(params: GenerateStreamParams): AsyncIterable<string>;
}
