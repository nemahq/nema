export type BooleanString = "true" | "false";

export function isBooleanString(v: string): v is BooleanString {
  return v === "true" || v === "false";
}
