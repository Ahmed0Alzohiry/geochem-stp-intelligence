import { createSupabaseBrowserClient } from "./client";

async function main() {
  const supabase = createSupabaseBrowserClient();

  const { error, count } = await supabase
    .from("companies")
    .select("id", { count: "exact", head: true })
    .abortSignal(AbortSignal.timeout(20000));

  const sample = await supabase
    .from("companies")
    .select("id, company_name")
    .limit(1)
    .abortSignal(AbortSignal.timeout(20000));

  const message = error?.message ?? sample.error?.message ?? "";
  const code = error?.code ?? sample.error?.code ?? null;
  const rlsBlocked =
    code === "42501" || /row-level security|permission denied|rls/i.test(message);

  console.log(
    JSON.stringify({
      countError: error?.message ?? null,
      countCode: error?.code ?? null,
      count,
      sampleError: sample.error?.message ?? null,
      sampleCode: sample.error?.code ?? null,
      sampleRows: (sample.data ?? []).length,
      rlsBlocked,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown companies audit error";
  console.log(JSON.stringify({ fatal: message }));
  process.exitCode = 1;
});
