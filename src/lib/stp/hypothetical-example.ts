import { scoreServiceAccount } from "./score";
import { COMMERCIAL_WEIGHT_TOTAL } from "./weights";
import type { ServiceFirstScore } from "./types";

/**
 * HYPOTHETICAL worked example only.
 * Not a live company. Do not persist.
 */
export function hypotheticalPetrochemicalExample(): {
  hypothetical: true;
  weightsSumTo100: boolean;
  result: ServiceFirstScore;
} {
  const result = scoreServiceAccount({
    serviceId: "00000000-0000-4000-8000-000000000pch",
    serviceCode: "PCH",
    serviceName: "Petrochemical Services",
    companyId: "00000000-0000-4000-8000-00000000demo",
    companyName: "Example Yanbu Polymer Operations (HYPOTHETICAL)",
    industry: "Petrochemicals",
    subsector: "Polyethylene manufacturing",
    customerType: "Manufacturer",
    entityType: "FACILITY",
    parentCompanyName: "Example Petrochemical Company",
    isExistingGeochemCustomer: "Unknown",
    accountStatus: "Prospect",
    verifiedCities: ["Yanbu"],
    importedCity: "Yanbu",
    companyServicesNeed: null,
    companyServicesFitRating: null,
  });
  return { hypothetical: true, weightsSumTo100: COMMERCIAL_WEIGHT_TOTAL === 100, result };
}

export const SCHEMA_GAPS = [
  "company_scores has no service_id — v1 1–5 criterion ratings; not used for service-first STP.",
  "company_target_snapshots has no service_id — latest view is per company, not per service.",
  "Proposed additive table: company_service_stp_scores (migration 007, not applied in STEP 6.5).",
  "company_services is empty (0 rows) — service need stays UNKNOWN until populated or derived later.",
  "No dedicated service→segment table (eligibility currently lives in code).",
  "No positioning / value-proposition table (playbook currently lives in code).",
  "contacts is empty — recommended roles can show; named verified contacts cannot.",
] as const;
