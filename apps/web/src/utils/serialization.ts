export type BooleanString = "true" | "false";

export function isBooleanString(v: string): v is BooleanString {
  return v === "true" || v === "false";
}

export type JsonRecord = string & { __brand?: "JsonRecord" };

export function isJsonRecord(v: string): v is JsonRecord {
  try {
    const parsed: unknown = JSON.parse(v);
    return (
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    );
  } catch {
    return false;
  }
}
