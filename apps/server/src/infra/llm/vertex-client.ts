import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

import { getEnv } from "@server/env";
import { LlmError } from "@server/infra/llm/llm-error";

const VERTEX_DEFAULT_LOCATION = "global";

const ServiceAccountCredentialsSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

export function parseServiceAccountJson(json: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    // SyntaxError 메시지엔 private_key가 포함된 원문 일부가 그대로 실릴 수 있어 던지지 않는다.
    throw new LlmError(
      "auth",
      "GEMINI_VERTEX_SERVICE_ACCOUNT_JSON is not valid JSON",
    );
  }
  const result = ServiceAccountCredentialsSchema.safeParse(parsed);
  if (!result.success) {
    throw new LlmError(
      "auth",
      `GEMINI_VERTEX_SERVICE_ACCOUNT_JSON is not a valid service account key: ${result.error.message}`,
    );
  }
  return result.data;
}

// 설정 시 Vertex(ADC 인증 — 로컬은 gcloud 로그인, 헤드리스 배포는 서비스 계정 키),
// 없으면 GEMINI_API_KEY로 AI Studio를 쓴다.
function createGeminiClient(opts: {
  vertexProject?: string;
  vertexLocation?: string;
  vertexServiceAccountJson?: string;
  apiKey?: string;
}): GoogleGenAI {
  if (opts.vertexProject) {
    return new GoogleGenAI({
      vertexai: true,
      project: opts.vertexProject,
      location: opts.vertexLocation ?? VERTEX_DEFAULT_LOCATION,
      ...(opts.vertexServiceAccountJson && {
        googleAuthOptions: {
          credentials: parseServiceAccountJson(opts.vertexServiceAccountJson),
        },
      }),
    });
  }
  if (!opts.apiKey) {
    throw new LlmError(
      "auth",
      "GEMINI_API_KEY or GEMINI_VERTEX_PROJECT is required to use a Google model",
    );
  }
  return new GoogleGenAI({ apiKey: opts.apiKey });
}

let sharedClient: GoogleGenAI | undefined;

export function getGeminiClient(): GoogleGenAI {
  if (sharedClient) {
    return sharedClient;
  }
  const env = getEnv();
  sharedClient = createGeminiClient({
    vertexProject: env.GEMINI_VERTEX_PROJECT,
    vertexLocation: env.GEMINI_VERTEX_LOCATION,
    vertexServiceAccountJson: env.GEMINI_VERTEX_SERVICE_ACCOUNT_JSON,
    apiKey: env.GEMINI_API_KEY,
  });
  return sharedClient;
}
