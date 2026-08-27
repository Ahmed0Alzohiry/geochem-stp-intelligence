/**
 * CSV → company_import_staging loader + dry-run dedup.
 *
 * Never writes public.companies.
 *
 * Local dry-run (default):
 *   npx tsx src/lib/import/run-staging-import.ts --csv docs/company-import-template.csv
 *
 * Batch 1 later (staging only, still no production companies):
 *   npx tsx --env-file=.env.local src/lib/import/run-staging-import.ts --csv path/to/batch1.csv --read-production --write-staging
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyUniverse } from "./matcher";
import { loadProductionUniverse, runStagingPipeline } from "./pipeline";

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const csvPath = argValue("--csv");
  if (!csvPath) {
    throw new Error("Missing --csv path");
  }

  const writeStaging = hasFlag("--write-staging");
  const readProduction = hasFlag("--read-production") || writeStaging;
  const csvText = readFileSync(resolve(csvPath), "utf8");
  const production = readProduction ? await loadProductionUniverse() : emptyUniverse();

  const result = await runStagingPipeline({
    csvText,
    production,
    writeStaging,
  });

  if (writeStaging && result.writeError) {
    throw new Error(result.writeError);
  }

  const summary = {
    csv: csvPath,
    accepted: result.load.accepted.length,
    rejected: result.load.rejected.length,
    classifications: countBy(result.matches.map((match) => match.classification)),
    wroteStaging: result.wroteStaging,
    productionCompanyWrites: 0,
    rejectedRows: result.load.rejected.map((row) => ({
      sourceRow: row.sourceRow,
      errors: row.errors,
    })),
    matches: result.matches.map((match) => ({
      sourceRow: match.row.sourceRow,
      name: match.row.companyName,
      classification: match.classification,
      importDecision: match.importDecision,
      dedupStatus: match.dedupStatus,
      reason: match.reason,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

function countBy(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown import error";
  console.error(message);
  process.exitCode = 1;
});
