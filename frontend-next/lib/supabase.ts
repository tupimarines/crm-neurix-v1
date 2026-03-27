import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Set the Supabase auth session using tokens from localStorage.
 * Call this before making authenticated queries.
 */
export async function setSupabaseSession() {
    const accessToken = localStorage.getItem("access_token");
    const refreshToken = localStorage.getItem("refresh_token");
    if (accessToken) {
        await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || "",
        });
    }
}

export async function persistAuthSession(accessToken: string, refreshToken?: string | null) {
    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken || "");
    await setSupabaseSession();
}

export async function clearAuthSession() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    await supabase.auth.signOut().catch(() => undefined);
}
