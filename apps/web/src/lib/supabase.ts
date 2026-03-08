import { createClient } from "@supabase/supabase-js";

import { getEnv } from "@web/app/env";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = getEnv();
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
