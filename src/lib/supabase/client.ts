import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function publicSupabaseConfig() {
  // Next.js only inlines NEXT_PUBLIC_* on the client when the key is a static
  // member access. process.env[name] works on the server and fails in the browser.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing. Set it in the host environment.");
  }
  if (!anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is missing. Set it in the host environment.");
  }
  return { url, anonKey };
}

export function createSupabaseBrowserClient(): SupabaseClient {
  const { url, anonKey } = publicSupabaseConfig();

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          cache: "no-store",
        }),
    },
  });
}
