import OpenAI from "openai";

import { getEnv } from "@server/env";
import { LlmError } from "@server/infra/llm/llm-error";

let sharedClient: OpenAI | undefined;

export function getOpenAiClient(): OpenAI {
  if (sharedClient) {
    return sharedClient;
  }
  const apiKey = getEnv().OPENAI_API_KEY;
  if (!apiKey) {
    throw new LlmError("auth", "OPENAI_API_KEY is required");
  }
  sharedClient = new OpenAI({ apiKey });
  return sharedClient;
}
