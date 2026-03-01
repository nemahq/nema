import { VoyageAIClient } from "voyageai";
import type {
  EmbeddingProvider,
  EmbeddingInputType,
  EmbeddingResult,
  EmbeddingProviderConfig,
} from "./embedding-provider.js";
import { EmbeddingError } from "./embedding-provider.js";

const DEFAULT_MODEL = "voyage-4-large";
const DEFAULT_DIMENSION = 1024;
const MAX_BATCH_SIZE = 128;

export interface VoyageProviderConfig extends EmbeddingProviderConfig {
  apiKey: string;
  timeoutSeconds?: number;
}

export function createVoyageProvider(
  config: VoyageProviderConfig,
): EmbeddingProvider {
  const {
    apiKey,
    model = DEFAULT_MODEL,
    dimension = DEFAULT_DIMENSION,
    timeoutSeconds = 30,
  } = config;

  const client = new VoyageAIClient({ apiKey });

  return {
    providerId: "voyage",
    model,
    dimension,

    async embed(
      texts: string[],
      inputType: EmbeddingInputType,
    ): Promise<EmbeddingResult> {
      if (texts.length === 0) {
        return { embeddings: [], model, dimension, usage: { totalTokens: 0 } };
      }

      if (texts.length > MAX_BATCH_SIZE) {
        throw new EmbeddingError(
          `Batch size ${texts.length} exceeds limit of ${MAX_BATCH_SIZE}`,
          "voyage",
        );
      }

      try {
        const response = await client.embed(
          {
            input: texts,
            model,
            inputType,
            outputDimension: dimension,
          },
          { timeoutInSeconds: timeoutSeconds },
        );

        const embeddings = (response.data ?? []).map((item) => {
          if (!item.embedding) {
            throw new EmbeddingError(
              "Response item missing embedding vector",
              "voyage",
            );
          }
          return item.embedding;
        });

        if (embeddings.length !== texts.length) {
          throw new EmbeddingError(
            `Expected ${texts.length} embeddings, got ${embeddings.length}`,
            "voyage",
          );
        }

        return {
          embeddings,
          model,
          dimension,
          usage: response.usage?.totalTokens
            ? { totalTokens: response.usage.totalTokens }
            : undefined,
        };
      } catch (error) {
        if (error instanceof EmbeddingError) throw error;
        throw new EmbeddingError(
          `Voyage embed failed: ${error instanceof Error ? error.message : String(error)}`,
          "voyage",
          error,
        );
      }
    },
  };
}
