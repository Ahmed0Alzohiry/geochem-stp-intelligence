/**
 * FAST-2 engine isolation self-test. No database writes.
 */
import { scoreServiceAccount } from "./score";
import {
  CANONICAL_SERVICE_CODES,
  getCanonicalServiceDefinition,
  serviceReadiness,
  validateServiceRegistry,
} from "./service-registry";
import type { ServiceFirstInput } from "./types";

function base(serviceCode: ServiceFirstInput["serviceCode"]): ServiceFirstInput {
  return {
    serviceId: `svc-${serviceCode.toLowerCase()}`,
    serviceCode,
    serviceName: serviceCode,
    companyId: "company-demo",
    companyName: "Example Yanbu Polymer Operations (HYPOTHETICAL)",
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
  };
}

export function runFast2EngineSelfTest(): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  const registry = validateServiceRegistry(
    CANONICAL_SERVICE_CODES.map((code) => ({
      id: code,
      name: code,
      service_code: code,
      active: true,
    })),
  );
  if (!registry.ok) failures.push(...registry.errors);

  if (serviceReadiness("PCH") !== "CONFIGURED") failures.push("PCH must be CONFIGURED");
  if (serviceReadiness("ENV") !== "NOT_CONFIGURED") failures.push("ENV must stay NOT_CONFIGURED until 24 Wave-1 rows persist");
  if (serviceReadiness("ENV", 24) !== "CONFIGURED") failures.push("ENV must be CONFIGURED when persisted count is 24");
  if (serviceReadiness("ENV", 23) !== "NOT_CONFIGURED") failures.push("ENV must not be CONFIGURED at count 23");
  if (serviceReadiness("PET", 100) !== "NOT_CONFIGURED") failures.push("PET must stay NOT_CONFIGURED even with rows");
  for (const code of CANONICAL_SERVICE_CODES) {
    if (code === "PCH" || code === "ENV") continue;
    if (serviceReadiness(code) !== "NOT_CONFIGURED") failures.push(`${code} must stay NOT_CONFIGURED until validated`);
    if (getCanonicalServiceDefinition(code).persistenceApproved) failures.push(`${code} persistence must not be approved`);
  }
  if (getCanonicalServiceDefinition("ENV").persistenceApproved) {
    failures.push("ENV must not be statically persistence-approved");
  }

  const pch = scoreServiceAccount(base("PCH"));
  const pet = scoreServiceAccount(base("PET"));
  const min = scoreServiceAccount(base("MIN"));
  if (pch.serviceCode !== "PCH" || pet.serviceCode !== "PET") failures.push("scores must keep their serviceCode");
  if (pch.eligibility !== "ELIGIBLE") failures.push("PCH petrochemicals should be eligible");
  if (min.eligibility !== "OUT_OF_SCOPE") failures.push("MIN must not treat petrochemicals as eligible");
  if (pch.commercialScore === pet.commercialScore && pch.dimensions[0].rawScore === pet.dimensions[0].rawScore) {
    failures.push("PCH and PET industry fit should not be identical for this hypothetical");
  }
  if (pch.modelVersion !== pet.modelVersion) failures.push("model version must stay shared 6.4.0");

  return { ok: failures.length === 0, failures };
}

if (process.argv[1]?.includes("run-fast-2-self-test")) {
  const result = runFast2EngineSelfTest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
