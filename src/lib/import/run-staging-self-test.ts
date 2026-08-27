import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { matchBatch } from "./matcher";
import { normalizeCommercialRegistration, normalizeCompanyName, normalizeWebsiteDomain } from "./normalize";
import { parseCsv } from "./csv";
import { runStagingPipeline } from "./pipeline";
import { validateCsvRecords } from "./validate";
import type { MatchUniverse } from "./types";

function classFor(matches: { row: { sourceRow: number }; classification: string }[], sourceRow: number) {
  const match = matches.find((item) => item.row.sourceRow === sourceRow);
  assert.ok(match, `missing source_row ${sourceRow}`);
  return match.classification;
}

async function main() {
  assert.equal(normalizeCompanyName("DEMO Western Refining Co."), "demowesternrefiningco");
  assert.equal(
    normalizeWebsiteDomain("https://www.Demo-Western-Refining.example/about", null),
    "demo-western-refining.example",
  );
  assert.equal(normalizeCommercialRegistration("1010-123456"), "1010123456");

  const csvText = readFileSync(resolve("docs/company-import-template.csv"), "utf8");
  const parsed = parseCsv(csvText);
  const loaded = validateCsvRecords(parsed.records);
  assert.equal(loaded.rejected.length, 0);
  assert.equal(loaded.accepted.length, 5);

  const emptyRun = await runStagingPipeline({ csvText, writeStaging: false });
  assert.equal(emptyRun.wroteStaging, false);
  assert.equal(classFor(emptyRun.matches, 1), "NEW");
  assert.equal(classFor(emptyRun.matches, 2), "NEW");
  assert.equal(classFor(emptyRun.matches, 3), "NEW");
  assert.equal(classFor(emptyRun.matches, 4), "FACILITY_OF_EXISTING");
  assert.equal(classFor(emptyRun.matches, 5), "NEW");

  const production: MatchUniverse = {
    companies: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        origin: "production",
        companyName: "DEMO Eastern Preview Co.",
        legalName: "DEMO Eastern Preview Company",
        normalizedName: "demoeasternpreviewco",
        websiteDomain: "demo-eastern-preview.example",
        commercialRegistrationNumber: null,
        parentCompanyName: null,
        city: "Jubail",
      },
    ],
    aliases: [
      {
        companyId: "11111111-1111-4111-8111-111111111111",
        normalizedAlias: "demoeasternpreview",
      },
    ],
    locations: [],
  };

  const againstSynthetic = matchBatch(loaded.accepted, production);
  assert.equal(classFor(againstSynthetic, 5), "DUPLICATE");

  const invalidRecords = validateCsvRecords([
    {
      batch_id: "W1-B1",
      source_row: "99",
      company_name: "",
      legal_name: "",
      name_ar: "",
      alias_name: "",
      website: "",
      website_domain: "",
      commercial_registration_number: "",
      industry: "",
      subsector: "",
      customer_type: "",
      region: "Western Region",
      city: "Yanbu",
      industrial_city: "",
      parent_company_name: "",
      business_description: "",
      main_activities: "",
      location_type: "",
      location_city: "",
      source_url: "not-a-url",
      source_type: "Other",
      source_reliability: "Low",
      source_tier: "Z",
      verification_status: "Unverified",
      last_verified_at: "",
      data_completeness_status: "",
      is_demo: "true",
      researcher_notes: "INVALID SYNTHETIC",
    },
  ]);
  assert.ok(invalidRecords.rejected.length >= 1);
  assert.equal(invalidRecords.accepted.length, 0);

  const duplicateNameUniverse: MatchUniverse = {
    companies: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        origin: "production",
        companyName: "DEMO Red Sea Utilities LLC",
        legalName: null,
        normalizedName: "demoredseautilitiesllc",
        websiteDomain: "other-host.example",
        commercialRegistrationNumber: null,
        parentCompanyName: null,
        city: "Rabigh",
      },
    ],
    aliases: [],
    locations: [],
  };
  const nameOnly = matchBatch(loaded.accepted, duplicateNameUniverse);
  assert.equal(classFor(nameOnly, 2), "POSSIBLE_MATCH");

  console.log(
    JSON.stringify({
      ok: true,
      templateRows: loaded.accepted.length,
      emptyUniverse: emptyRun.matches.map((match) => ({
        sourceRow: match.row.sourceRow,
        classification: match.classification,
      })),
      rejectedSynthetic: invalidRecords.rejected.length,
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : "Self-test failed";
  console.error(message);
  process.exitCode = 1;
});
