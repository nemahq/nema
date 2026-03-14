import { redirect } from "@tanstack/react-router";

import { supabase } from "@web/lib/supabase";

export async function requireAuth(currentHref: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  if (!data.session) {
    throw redirect({ to: "/signin", search: { redirect: currentHref } });
  }
}

export async function requireGuest(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  if (data.session) {
    throw redirect({ to: "/" });
  }
}
