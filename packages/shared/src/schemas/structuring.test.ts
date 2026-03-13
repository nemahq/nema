import { describe, expect, it } from "vitest";

import { SaveOutputSchema } from "./structuring";

const validSaveMeta = {
  title: "Senior Frontend Interview Feedback",
  category: "hiring/interview-feedback",
  tags: ["hiring", "frontend", "senior"],
  summary: "Senior frontend interview — tech skills strong",
};

describe("SaveOutputSchema", () => {
  it("parses valid create action", () => {
    const input = { ...validSaveMeta, action: "create", target_id: null };
    const result = SaveOutputSchema.parse(input);
    expect(result.action).toBe("create");
    expect(result.target_id).toBeNull();
  });

  it("parses valid update action", () => {
    const input = {
      ...validSaveMeta,
      action: "update",
      target_id: "doc_abc123",
      merged_body: "Combined content from existing and new body.",
    };
    const result = SaveOutputSchema.parse(input);
    expect(result.action).toBe("update");
    if (result.action === "update") {
      expect(result.target_id).toBe("doc_abc123");
      expect(result.merged_body).toBe(
        "Combined content from existing and new body.",
      );
    }
  });

  it("includes all meta fields on create", () => {
    const input = { ...validSaveMeta, action: "create", target_id: null };
    const result = SaveOutputSchema.parse(input);
    expect(result.title).toBe(validSaveMeta.title);
    expect(result.category).toBe(validSaveMeta.category);
    expect(result.tags).toEqual(validSaveMeta.tags);
    expect(result.summary).toBe(validSaveMeta.summary);
  });

  it("rejects invalid action", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        action: "delete",
        target_id: null,
      }),
    ).toThrow();
  });

  it("rejects missing action", () => {
    expect(() =>
      SaveOutputSchema.parse({ ...validSaveMeta, target_id: null }),
    ).toThrow();
  });

  it("rejects create with non-null target_id", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        action: "create",
        target_id: "doc_abc123",
      }),
    ).toThrow();
  });

  it("rejects update with null target_id", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        action: "update",
        target_id: null,
        merged_body: "content",
      }),
    ).toThrow();
  });

  it("rejects update with empty target_id", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        action: "update",
        target_id: "",
        merged_body: "content",
      }),
    ).toThrow();
  });

  it("rejects update without merged_body", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        action: "update",
        target_id: "doc_abc123",
      }),
    ).toThrow();
  });

  it("rejects update with empty merged_body", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        action: "update",
        target_id: "doc_abc123",
        merged_body: "",
      }),
    ).toThrow();
  });

  it("parses create without category (optional)", () => {
    const { title, tags, summary } = validSaveMeta;
    const input = { title, tags, summary, action: "create", target_id: null };
    const result = SaveOutputSchema.parse(input);
    expect(result.category).toBeUndefined();
  });

  it("rejects non-string tags", () => {
    expect(() =>
      SaveOutputSchema.parse({
        ...validSaveMeta,
        tags: [1, 2],
        action: "create",
        target_id: null,
      }),
    ).toThrow();
  });
});
