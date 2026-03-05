import { describe, it, expect } from "vitest";
import { DraftOutputSchema, SaveOutputSchema } from "./structuring.js";

describe("DraftOutputSchema", () => {
  it("parses valid draft with session_title", () => {
    const input = {
      body: "Interviewed a senior frontend candidate.",
      session_title: "프론트엔드 시니어 면접 피드백",
    };
    const result = DraftOutputSchema.parse(input);
    expect(result).toEqual(input);
  });

  it("parses draft with null session_title (edit cycle)", () => {
    const input = { body: "Updated draft content.", session_title: null };
    const result = DraftOutputSchema.parse(input);
    expect(result.session_title).toBeNull();
  });

  it("rejects missing body", () => {
    expect(() => DraftOutputSchema.parse({ session_title: "title" })).toThrow();
  });

  it("rejects missing session_title", () => {
    expect(() => DraftOutputSchema.parse({ body: "content" })).toThrow();
  });

  it("rejects empty body", () => {
    expect(() => DraftOutputSchema.parse({ body: "" })).toThrow();
  });

  it("rejects empty session_title when present", () => {
    expect(() =>
      DraftOutputSchema.parse({ body: "content", session_title: "" }),
    ).toThrow();
  });

  it("strips extra fields from parsed output", () => {
    const result = DraftOutputSchema.safeParse({
      body: "content",
      session_title: null,
      extra: "field",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("extra");
    }
  });
});

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
