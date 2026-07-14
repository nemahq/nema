import { describe, expect, it } from "vitest";

import { LlmError } from "./llm-error";
import { parseServiceAccountJson } from "./model-factory";

describe("parseServiceAccountJson", () => {
  it("returns the credentials on a valid service account key", () => {
    const json = JSON.stringify({
      client_email: "nema-vertex@nema-499411.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    });

    expect(parseServiceAccountJson(json)).toEqual({
      client_email: "nema-vertex@nema-499411.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    });
  });

  it("throws LlmError without leaking the raw input when JSON is malformed", () => {
    const truncated = '{"client_email": "a@b.com", "private_key": "-----BEGIN';

    try {
      parseServiceAccountJson(truncated);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).code).toBe("auth");
      expect((err as LlmError).message).not.toContain("BEGIN");
    }
  });

  it("throws LlmError when required fields are missing", () => {
    const json = JSON.stringify({ client_email: "a@b.com" });

    expect(() => parseServiceAccountJson(json)).toThrow(LlmError);
  });
});
