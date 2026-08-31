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
import { personasForService } from "../contacts/service-persona-map";
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
  if (serviceReadiness("INS") !== "NOT_CONFIGURED") failures.push("INS must stay NOT_CONFIGURED until 22 Wave-1 rows persist");
  if (serviceReadiness("INS", 22) !== "CONFIGURED") failures.push("INS must be CONFIGURED when persisted count is 22");
  if (serviceReadiness("INS", 21) !== "NOT_CONFIGURED") failures.push("INS must not be CONFIGURED at count 21");
  if (serviceReadiness("PET") !== "NOT_CONFIGURED") failures.push("PET must stay NOT_CONFIGURED until 18 Wave-1 rows persist");
  if (serviceReadiness("PET", 18) !== "CONFIGURED") failures.push("PET must be CONFIGURED when persisted count is 18");
  if (serviceReadiness("PET", 17) !== "NOT_CONFIGURED") failures.push("PET must not be CONFIGURED at count 17");
  if (serviceReadiness("PET", 100) !== "CONFIGURED") {
    failures.push("PET must stay CONFIGURED after Wave-1 when additional current rows are promoted");
  }
  if (serviceReadiness("OCM") !== "NOT_CONFIGURED") failures.push("OCM must stay NOT_CONFIGURED until 25 Wave-1 rows persist");
  if (serviceReadiness("OCM", 25) !== "CONFIGURED") failures.push("OCM must be CONFIGURED when persisted count is 25");
  if (serviceReadiness("OCM", 24) !== "NOT_CONFIGURED") failures.push("OCM must not be CONFIGURED at count 24");
  if (personasForService("OCM").length !== 8) failures.push("OCM must keep 8 Wave-1 personas");
  if (serviceReadiness("LAB") !== "NOT_CONFIGURED") failures.push("LAB must stay NOT_CONFIGURED until 21 Wave-1 rows persist");
  if (serviceReadiness("LAB", 21) !== "CONFIGURED") failures.push("LAB must be CONFIGURED when persisted count is 21");
  if (serviceReadiness("LAB", 20) !== "NOT_CONFIGURED") failures.push("LAB must not be CONFIGURED at count 20");
  if (personasForService("LAB").length !== 8) failures.push("LAB must keep 8 Wave-1 personas");
  if (serviceReadiness("MCT") !== "NOT_CONFIGURED") failures.push("MCT must stay NOT_CONFIGURED until 26 Wave-1 rows persist");
  if (serviceReadiness("MCT", 26) !== "CONFIGURED") failures.push("MCT must be CONFIGURED when persisted count is 26");
  if (serviceReadiness("MCT", 25) !== "NOT_CONFIGURED") failures.push("MCT must not be CONFIGURED at count 25");
  if (personasForService("MCT").length !== 8) failures.push("MCT must keep 8 Wave-1 personas");
  for (const code of CANONICAL_SERVICE_CODES) {
    if (code === "PCH" || code === "ENV" || code === "INS" || code === "PET" || code === "OCM" || code === "LAB" || code === "MCT") continue;
    if (serviceReadiness(code) !== "NOT_CONFIGURED") failures.push(`${code} must stay NOT_CONFIGURED until validated`);
    if (getCanonicalServiceDefinition(code).persistenceApproved) failures.push(`${code} persistence must not be approved`);
  }
  if (getCanonicalServiceDefinition("ENV").persistenceApproved) {
    failures.push("ENV must not be statically persistence-approved");
  }
  if (getCanonicalServiceDefinition("INS").persistenceApproved) {
    failures.push("INS must not be statically persistence-approved");
  }

  const pch = scoreServiceAccount(base("PCH"));
  const pet = scoreServiceAccount(base("PET"));
  const min = scoreServiceAccount(base("MIN"));
  const ocm = scoreServiceAccount(base("OCM"));
  const lab = scoreServiceAccount(base("LAB"));
  const mct = scoreServiceAccount(base("MCT"));
  if (pch.serviceCode !== "PCH" || pet.serviceCode !== "PET") failures.push("scores must keep their serviceCode");
  if (pch.eligibility !== "ELIGIBLE") failures.push("PCH petrochemicals should be eligible");
  if (ocm.eligibility !== "ELIGIBLE") failures.push("OCM polymer/polyethylene plant should be eligible");
  if (lab.eligibility !== "ELIGIBLE") failures.push("LAB polymer/polyethylene plant should be eligible");
  if (mct.eligibility !== "ELIGIBLE") failures.push("MCT polymer/polyethylene plant should be eligible");
  const ocmMed = scoreServiceAccount({ ...base("OCM"), verifiedCities: [], importedCity: "Jubail" });
  if (ocmMed.tier === "Tier 1") failures.push("OCM must not force Tier 1 when geography is unknown");
  const labMed = scoreServiceAccount({ ...base("LAB"), verifiedCities: [], importedCity: "Jubail" });
  if (labMed.tier === "Tier 1") failures.push("LAB must not force Tier 1 when geography is unknown");
  const mctMed = scoreServiceAccount({ ...base("MCT"), verifiedCities: [], importedCity: "Jubail" });
  if (mctMed.tier === "Tier 1") failures.push("MCT must not force Tier 1 when geography is unknown");
  const labOffice = scoreServiceAccount({
    ...base("LAB"),
    companyName: "Generic Industrial Office",
    industry: "Industrial Manufacturing",
    subsector: "Corporate headquarters",
  });
  if (labOffice.eligibility !== "OUT_OF_SCOPE") failures.push("LAB must not treat industry-only offices as eligible");
  const mctOffice = scoreServiceAccount({
    ...base("MCT"),
    companyName: "Generic Industrial Office",
    industry: "Industrial Manufacturing",
    subsector: "Corporate headquarters",
  });
  if (mctOffice.eligibility !== "OUT_OF_SCOPE") failures.push("MCT must not treat industry-only offices as eligible");
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
