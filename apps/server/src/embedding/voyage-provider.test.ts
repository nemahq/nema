import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbeddingError } from "./embedding-provider.js";

const mockEmbed = vi.fn();

vi.mock("voyageai", () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({ embed: mockEmbed })),
}));

import { createVoyageProvider } from "./voyage-provider.js";

describe("createVoyageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns provider with correct metadata", () => {
    const provider = createVoyageProvider({ apiKey: "test-key" });
    expect(provider.providerId).toBe("voyage");
    expect(provider.model).toBe("voyage-4-large");
    expect(provider.dimension).toBe(1024);
  });

  it("accepts custom model and dimension", () => {
    const provider = createVoyageProvider({
      apiKey: "key",
      model: "voyage-4-lite",
      dimension: 512,
    });
    expect(provider.model).toBe("voyage-4-lite");
    expect(provider.dimension).toBe(512);
  });

  it("returns embeddings for given texts", async () => {
    mockEmbed.mockResolvedValue({
      data: [
        { embedding: [0.1, 0.2], index: 0 },
        { embedding: [0.3, 0.4], index: 1 },
      ],
      usage: { totalTokens: 10 },
    });

    const provider = createVoyageProvider({
      apiKey: "test-key",
      dimension: 2,
    });
    const result = await provider.embed(["hello", "world"], "document");

    expect(result.embeddings).toHaveLength(2);
    expect(result.embeddings[0]).toEqual([0.1, 0.2]);
    expect(result.model).toBe("voyage-4-large");
    expect(result.usage?.totalTokens).toBe(10);
  });

  it("returns empty result for empty input", async () => {
    const provider = createVoyageProvider({ apiKey: "test-key" });
    const result = await provider.embed([], "query");

    expect(result.embeddings).toHaveLength(0);
    expect(result.usage?.totalTokens).toBe(0);
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  it("throws EmbeddingError when batch exceeds 128", async () => {
    const provider = createVoyageProvider({ apiKey: "test-key" });
    const texts = Array.from({ length: 129 }, (_, i) => `text-${i}`);

    await expect(provider.embed(texts, "document")).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("throws EmbeddingError on API failure", async () => {
    mockEmbed.mockRejectedValue(new Error("Network timeout"));

    const provider = createVoyageProvider({ apiKey: "test-key" });
    const err = await provider
      .embed(["test"], "document")
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(EmbeddingError);
    expect((err as EmbeddingError).provider).toBe("voyage");
  });

  it("throws EmbeddingError when response item missing embedding", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ index: 0 }],
    });

    const provider = createVoyageProvider({ apiKey: "test-key" });
    await expect(provider.embed(["test"], "document")).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("throws EmbeddingError when count mismatch", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.1], index: 0 }],
    });

    const provider = createVoyageProvider({ apiKey: "test-key" });
    await expect(
      provider.embed(["text1", "text2"], "document"),
    ).rejects.toThrow(EmbeddingError);
  });

  it("throws EmbeddingError when response.data is null", async () => {
    mockEmbed.mockResolvedValue({ data: null });

    const provider = createVoyageProvider({ apiKey: "test-key" });
    await expect(provider.embed(["test"], "document")).rejects.toThrow(
      EmbeddingError,
    );
  });

  it("preserves totalTokens: 0 in usage", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [0.1], index: 0 }],
      usage: { totalTokens: 0 },
    });

    const provider = createVoyageProvider({ apiKey: "test-key" });
    const result = await provider.embed(["test"], "document");
    expect(result.usage).toEqual({ totalTokens: 0 });
  });

  it("passes inputType and outputDimension to SDK", async () => {
    mockEmbed.mockResolvedValue({
      data: [{ embedding: [1.0], index: 0 }],
    });

    const provider = createVoyageProvider({
      apiKey: "key",
      dimension: 512,
    });
    await provider.embed(["test"], "query");

    expect(mockEmbed).toHaveBeenCalledWith(
      {
        input: ["test"],
        model: "voyage-4-large",
        inputType: "query",
        outputDimension: 512,
      },
      { timeoutInSeconds: 30 },
    );
  });
});
