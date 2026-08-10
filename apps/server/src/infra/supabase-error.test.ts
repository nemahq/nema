import { describe, expect, it } from "vitest";

import {
  isNotFoundError,
  SupabaseError,
  throwIfSupabaseError,
} from "@server/infra/supabase-error";

describe("throwIfSupabaseError", () => {
  it("does nothing for null", () => {
    expect(() => throwIfSupabaseError(null)).not.toThrow();
  });

  it("throws SupabaseError carrying the original code", () => {
    expect(() =>
      throwIfSupabaseError({ code: "23505", message: "duplicate key" }),
    ).toThrow(SupabaseError);
  });
});

describe("isNotFoundError", () => {
  it("is true for PostgREST's single-row-not-found code", () => {
    const error = new SupabaseError("no rows", "PGRST116");
    expect(isNotFoundError(error)).toBe(true);
  });

  it("is false for other Postgres/PostgREST codes", () => {
    const error = new SupabaseError("row-level security violation", "42501");
    expect(isNotFoundError(error)).toBe(false);
  });

  it("is false for non-SupabaseError values", () => {
    expect(isNotFoundError(new Error("PGRST116"))).toBe(false);
  });
});
