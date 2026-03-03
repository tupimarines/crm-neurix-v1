import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Set the Supabase auth session using the access_token from localStorage.
 * Call this before making authenticated queries.
 */
export async function setSupabaseSession() {
    const accessToken = localStorage.getItem("access_token");
    if (accessToken) {
        await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: "", // We don't store refresh_token in localStorage currently
        });
    }
}
