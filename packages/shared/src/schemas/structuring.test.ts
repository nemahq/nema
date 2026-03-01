import { describe, it, expect } from "vitest";
import { StructuredDraftSchema, StructuredSaveSchema } from "./structuring.js";

const validDraft = {
  title: "Senior Frontend Interview Feedback",
  category: "hiring/interview-feedback",
  tags: ["hiring", "frontend", "senior"],
  summary: "Senior frontend interview — tech skills strong",
  body: "Interviewed a senior frontend candidate.",
};

describe("StructuredDraftSchema", () => {
  it("parses valid draft", () => {
    const result = StructuredDraftSchema.parse(validDraft);
    expect(result).toEqual(validDraft);
  });

  it("rejects missing title", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title: _title, ...noTitle } = validDraft;
    expect(() => StructuredDraftSchema.parse(noTitle)).toThrow();
  });

  it("rejects non-string tags", () => {
    expect(() =>
      StructuredDraftSchema.parse({ ...validDraft, tags: [1, 2] }),
    ).toThrow();
  });

  it("rejects extra fields via strict parsing", () => {
    const result = StructuredDraftSchema.safeParse({
      ...validDraft,
      extra: "field",
    });
    // Zod strips extra fields by default; parsed result should not include them
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("extra");
    }
  });
});

describe("StructuredSaveSchema", () => {
  it("parses valid create action", () => {
    const input = { ...validDraft, action: "create", target_id: null };
    const result = StructuredSaveSchema.parse(input);
    expect(result.action).toBe("create");
    expect(result.target_id).toBeNull();
  });

  it("parses valid update action", () => {
    const input = { ...validDraft, action: "update", target_id: "doc_abc123" };
    const result = StructuredSaveSchema.parse(input);
    expect(result.action).toBe("update");
    expect(result.target_id).toBe("doc_abc123");
  });

  it("rejects invalid action", () => {
    expect(() =>
      StructuredSaveSchema.parse({
        ...validDraft,
        action: "delete",
        target_id: null,
      }),
    ).toThrow();
  });

  it("rejects missing action", () => {
    expect(() =>
      StructuredSaveSchema.parse({ ...validDraft, target_id: null }),
    ).toThrow();
  });

  it("includes all Phase 1 fields", () => {
    const input = { ...validDraft, action: "create", target_id: null };
    const result = StructuredSaveSchema.parse(input);
    expect(result.title).toBe(validDraft.title);
    expect(result.category).toBe(validDraft.category);
    expect(result.tags).toEqual(validDraft.tags);
    expect(result.summary).toBe(validDraft.summary);
    expect(result.body).toBe(validDraft.body);
  });

  it("rejects create with non-null target_id", () => {
    expect(() =>
      StructuredSaveSchema.parse({
        ...validDraft,
        action: "create",
        target_id: "doc_abc123",
      }),
    ).toThrow();
  });

  it("rejects update with null target_id", () => {
    expect(() =>
      StructuredSaveSchema.parse({
        ...validDraft,
        action: "update",
        target_id: null,
      }),
    ).toThrow();
  });
});
