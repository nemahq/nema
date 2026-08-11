import { describe, expect, it } from "vitest";

import { LlmError } from "@server/infra/llm/llm-error";
import { parseServiceAccountJson } from "@server/infra/llm/vertex-client";

describe("parseServiceAccountJson", () => {
  it("parses a valid service account key", () => {
    const json = JSON.stringify({
      client_email: "sa@project.iam.gserviceaccount.com",
      private_key:
        "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
    });

    const result = parseServiceAccountJson(json);

    expect(result.client_email).toBe("sa@project.iam.gserviceaccount.com");
  });

  it("throws LlmError without leaking the raw input when JSON is malformed", () => {
    const malformed = '{"private_key": "not closed';

    try {
      parseServiceAccountJson(malformed);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(LlmError);
      expect((error as LlmError).message).not.toContain("not closed");
    }
  });

  it("throws LlmError when required fields are missing", () => {
    const json = JSON.stringify({
      client_email: "sa@project.iam.gserviceaccount.com",
    });

    expect(() => parseServiceAccountJson(json)).toThrow(LlmError);
  });
});
