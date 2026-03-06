import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url) throw new Error("VITE_SUPABASE_URL이 설정되지 않았습니다.");
if (!anonKey) throw new Error("VITE_SUPABASE_ANON_KEY가 설정되지 않았습니다.");

export const supabase = createClient(url, anonKey);
