/**
 * Full-database targeting self-test. No database writes.
 */
import { scoreServiceAccount } from "./score";
import {
  filterDiscoveryRows,
  rankingReasonFor,
  summarizeDiscovery,
  toDiscoveryRows,
} from "./full-database-targeting";
import type { ScoredAccount } from "./account-group";
import type { ServiceFirstInput } from "./types";

function input(partial: Partial<ServiceFirstInput> = {}): ServiceFirstInput {
  return {
    serviceId: "ocm-svc",
    serviceCode: "OCM",
    serviceName: "Oil Condition Monitoring",
    companyId: "c1",
    companyName: "Example Yanbu Polymer Operations",
    industry: "Petrochemicals",
    subsector: "Polyethylene manufacturing",
    customerType: "Manufacturer",
    entityType: "FACILITY",
    parentCompanyName: "Example Parent",
    isExistingGeochemCustomer: null,
    accountStatus: "Prospect",
    verifiedCities: ["Yanbu"],
    importedCity: "Yanbu",
    companyServicesNeed: null,
    companyServicesFitRating: null,
    ...partial,
  };
}

export function runFullDatabaseTargetingSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const eligible = scoreServiceAccount(input());
  const office = scoreServiceAccount(
    input({
      companyId: "c2",
      companyName: "Generic Industrial Office",
      industry: "Industrial Manufacturing",
      subsector: "Corporate headquarters",
      verifiedCities: [],
    }),
  );
  const noIndustry = scoreServiceAccount(input({ companyId: "c3", companyName: "Unknown Co", industry: null }));

  if (eligible.eligibility !== "ELIGIBLE") failures.push("OCM polymer plant must be ELIGIBLE");
  if (office.eligibility !== "OUT_OF_SCOPE") failures.push("OCM industry-only office must be OUT_OF_SCOPE");
  if (noIndustry.eligibility !== "INSUFFICIENT_TO_ELIGIBLE") failures.push("missing industry must be INSUFFICIENT_TO_ELIGIBLE");

  const scored: ScoredAccount[] = [
    { input: input(), result: eligible, accountGroupKey: "g1" },
    {
      input: input({
        companyId: "c2",
        companyName: "Generic Industrial Office",
        industry: "Industrial Manufacturing",
        subsector: "Corporate headquarters",
        verifiedCities: [],
      }),
      result: office,
      accountGroupKey: "g2",
    },
    {
      input: input({ companyId: "c3", companyName: "Unknown Co", industry: null }),
      result: noIndustry,
      accountGroupKey: "g3",
    },
  ];
  const persisted = new Set(["c1"]);
  const rows = toDiscoveryRows(scored, persisted, "OCM");
  const summary = summarizeDiscovery(rows);
  if (summary.evaluated !== 3) failures.push(`evaluated ${summary.evaluated}`);
  if (summary.eligible !== 1) failures.push(`eligible ${summary.eligible}`);
  if (summary.ineligible !== 2) failures.push(`ineligible ${summary.ineligible}`);
  if (summary.insufficient !== 1) failures.push(`insufficient ${summary.insufficient}`);
  if (rows[0].provenance !== "PERSISTED_TARGET") failures.push("existing current row must stay PERSISTED_TARGET");
  if (rows[1].provenance !== "DISCOVERY_RESULT") failures.push("new evaluation must be DISCOVERY_RESULT");
  if (rows[0].rank == null) failures.push("ranking-eligible plant must receive a rank");
  if (rows[1].rank != null) failures.push("ineligible office must not receive a commercial rank");
  if (rows.some((row) => row.serviceNeedFit === 0)) failures.push("UNKNOWN must not become zero");
  if (!rankingReasonFor(office).includes("Not ranking eligible")) failures.push("ineligible ranking reason");
  const filtered = filterDiscoveryRows(rows, { eligibility: "ELIGIBLE" });
  if (filtered.length !== 1) failures.push("eligibility filter");
  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-full-database-targeting-self-test")) {
  const result = runFullDatabaseTargetingSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
