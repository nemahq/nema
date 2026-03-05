export type EmbeddingInputType = "document" | "query";

export interface EmbeddingResult {
  embeddings: number[][];
  model: string;
  dimension: number;
  usage?: { totalTokens: number };
}

export interface EmbeddingProviderConfig {
  model?: string;
  dimension?: number;
}

export interface EmbeddingProvider {
  readonly providerId: string;
  readonly model: string;
  readonly dimension: number;

  embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<EmbeddingResult>;
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "EmbeddingError";
  }
}
