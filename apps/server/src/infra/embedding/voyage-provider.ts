import { VoyageAIClient } from "voyageai";

import type {
  EmbeddingInputType,
  EmbeddingProvider,
  EmbeddingProviderConfig,
  EmbeddingResult,
} from "./embedding-provider";
import { EmbeddingError, VECTOR_DIMENSION } from "./embedding-provider";

const PROVIDER_ID = "voyage";
const DEFAULT_MODEL = "voyage-4-large";
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
    dimension = VECTOR_DIMENSION,
    timeoutSeconds = 30,
  } = config;

  const client = new VoyageAIClient({ apiKey });

  return {
    providerId: PROVIDER_ID,
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
          PROVIDER_ID,
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

        if (!response.data) {
          throw new EmbeddingError(
            "Voyage API returned no data in response",
            PROVIDER_ID,
          );
        }

        const embeddings = response.data.map((item) => {
          if (!item.embedding) {
            throw new EmbeddingError(
              "Response item missing embedding vector",
              PROVIDER_ID,
            );
          }
          return item.embedding;
        });

        if (embeddings.length !== texts.length) {
          throw new EmbeddingError(
            `Expected ${texts.length} embeddings, got ${embeddings.length}`,
            PROVIDER_ID,
          );
        }

        return {
          embeddings,
          model,
          dimension,
          usage:
            response.usage?.totalTokens != null
              ? { totalTokens: response.usage.totalTokens }
              : undefined,
        };
      } catch (error) {
        if (error instanceof EmbeddingError) throw error;
        throw new EmbeddingError(
          `Voyage embed failed: ${error instanceof Error ? error.message : String(error)}`,
          PROVIDER_ID,
          error,
        );
      }
    },
  };
}
