import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type IndustryConnectionRow = {
  id: string;
  name: string;
  active: boolean;
};

export type IndustriesConnectionTest = {
  ok: boolean;
  rlsBlocked: boolean;
  industriesReturned: number;
  names: string[];
  error: string | null;
};

/**
 * Read-only connection probe. Queries public.industries only.
 * Does not log secrets. RLS denials are reported, not bypassed.
 */
export async function testIndustriesConnection(): Promise<IndustriesConnectionTest> {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("industries")
    .select("id, name, active")
    .order("name", { ascending: true })
    .abortSignal(AbortSignal.timeout(20000));

  if (error) {
    const message = error.message;
    const rlsBlocked =
      error.code === "42501" ||
      /row-level security|permission denied|rls/i.test(message);

    return {
      ok: false,
      rlsBlocked,
      industriesReturned: 0,
      names: [],
      error: message,
    };
  }

  const rows = (data ?? []) as IndustryConnectionRow[];

  return {
    ok: true,
    rlsBlocked: false,
    industriesReturned: rows.length,
    names: rows.map((row) => row.name),
    error: null,
  };
}
