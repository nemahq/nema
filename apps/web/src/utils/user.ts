import type { User } from "@supabase/supabase-js";

type NameField = "givenName" | "fullName" | "email";

const NAME_RESOLVERS: Record<NameField, (user: User) => unknown> = {
  givenName: (u) => u.user_metadata?.given_name,
  fullName: (u) => u.user_metadata?.full_name,
  email: (u) => u.email,
};

const DEFAULT_PRIORITY: NameField[] = ["givenName", "fullName", "email"];

export function getDisplayName(
  user: User | null,
  priority: NameField[] = DEFAULT_PRIORITY,
): string {
  if (!user) {
    return "";
  }
  for (const field of priority) {
    const resolved = NAME_RESOLVERS[field](user);
    if (typeof resolved === "string" && resolved) {
      return resolved;
    }
  }
  return "";
}
