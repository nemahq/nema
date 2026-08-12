import type OpenAI from "openai";
import type { GoogleGenAI } from "@google/genai";

// 클라이언트는 lazy getter로 받는다 — model-factory가 실제로 고른 프로바이더의
// 클라이언트만 요청하므로, 안 쓰는 프로바이더의 키 부재로 안 터진다.
export interface ProviderClients {
  getOpenAiClient: () => OpenAI;
  getGeminiClient: () => GoogleGenAI;
}
