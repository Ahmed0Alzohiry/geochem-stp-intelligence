/**
 * LAB Wave-1 frozen target list (STEP 32.5.3).
 * 21 APPROVE accounts from 32.5.2. Production persist requires --write on the LAB writer.
 *
 * Petro Rabigh Refining and Polymer are both frozen. They share the live ER
 * account_group_key. STP unique index is (account_group_key, service_id) for
 * current representatives, so LAB persist uses facility-scoped group keys for
 * those two company_ids only — no silent substitute of either plant.
 */

import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { OCM_SERVICE_ID } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";

export const LAB_SERVICE_ID = "bd1b7fcb-5433-405e-9521-7d9bbbdd5958";
export const LAB_WAVE1_EXPECTED_COUNT = 21;
export const LAB_WAVE1_MANIFEST_VERSION = "32.5.3";

export const LAB_PETRO_RABIGH_POLYMER_ID = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
export const LAB_PETRO_RABIGH_REFINING_ID = "5f42dbe1-4a16-4657-8627-1c49d4ddca84";
export const LAB_PETRO_RABIGH_ER_GROUP_KEY = "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226";

export type LabWave1Confidence = "HIGH" | "MEDIUM";
export type LabUseKind = "refinery" | "polymer" | "complex" | "gas";

export type LabWave1ManifestEntry = {
  rank: number;
  companyName: string;
  companyId: string;
  entityGrain: "FACILITY" | "ACCOUNT";
  industry: string;
  subsector: string;
  customerType: string;
  confidence: LabWave1Confidence;
  locationLabel: string;
  useCase: string;
  overlap: string;
  verdict: "APPROVE";
  validationRationale: string;
  useKind: LabUseKind;
};

export const LAB_WAVE1_ACCOUNTS: readonly LabWave1ManifestEntry[] = [
  {
    rank: 1,
    companyName: "SAMREF Yanbu Industrial Operations",
    companyId: "3d9fc8b5-a439-4be7-acef-e6be121d65d0",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "SAMREF refinery petroleum-product and process-stream specification testing",
    overlap: "PCH+ENV+INS+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Operating Yanbu refinery with recurring product/process lab demand.",
    useKind: "refinery",
  },
  {
    rank: 2,
    companyName: "YASREF Yanbu Industrial Operations",
    companyId: "bffc98ac-41bc-4aa2-b542-23cb477dfda7",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "YASREF refinery petroleum-product and process-stream specification testing",
    overlap: "PCH+ENV+INS+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Operating Yanbu refinery with recurring product/process lab demand.",
    useKind: "refinery",
  },
  {
    rank: 3,
    companyName: "Luberef Jeddah Operations",
    companyId: "434b1729-803c-4c10-b702-eefd669663d9",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Base Oil Refining",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Jeddah",
    useCase: "Luberef base-oil / lubricant product specification testing",
    overlap: "PCH+ENV+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Base-oil plant is a recurring specification-testing buyer.",
    useKind: "refinery",
  },
  {
    rank: 4,
    companyName: "Saudi Yanbu Petrochemical Company - Yanpet Operations",
    companyId: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Petrochemical Manufacturing",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "Yanpet petrochemical feedstock and finished-product QC",
    overlap: "PCH+ENV+INS+OCM",
    verdict: "APPROVE",
    validationRationale: "Yanpet operating plant with recurring product QC demand.",
    useKind: "polymer",
  },
  {
    rank: 5,
    companyName: "Petro Rabigh Refining Operations",
    companyId: LAB_PETRO_RABIGH_REFINING_ID,
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Rabigh",
    useCase: "Petro Rabigh refinery product/process laboratory testing (independent of polymer)",
    overlap: "INS+PET",
    verdict: "APPROVE",
    validationRationale: "Independent refinery plant; not substituted by Polymer Operations.",
    useKind: "refinery",
  },
  {
    rank: 6,
    companyName: "Petro Rabigh Polymer Operations",
    companyId: LAB_PETRO_RABIGH_POLYMER_ID,
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polymers",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Rabigh",
    useCase: "Petro Rabigh polymer-plant product QC (independent of refining)",
    overlap: "PCH+ENV+OCM",
    verdict: "APPROVE",
    validationRationale: "Independent polymer plant; not substituted by Refining Operations.",
    useKind: "polymer",
  },
  {
    rank: 7,
    companyName: "Saudi Aramco Total Refining and Petrochemical Company",
    companyId: "b243ca65-1254-45e3-83f0-ec9d74a05274",
    entityGrain: "ACCOUNT",
    industry: "Refining",
    subsector: "Refining & Petrochemicals",
    customerType: "Asset Owner",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "SATORP Jubail refining/petrochemical product and process testing (ACCOUNT is the buying entity)",
    overlap: "PCH+ENV+INS+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "SATORP ACCOUNT is the Jubail buying entity; operations grain is excluded as duplicate.",
    useKind: "complex",
  },
  {
    rank: 8,
    companyName: "Saudi Aramco Jubail Refinery Company",
    companyId: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08",
    entityGrain: "ACCOUNT",
    industry: "Refining",
    subsector: "Refining",
    customerType: "Asset Owner",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "SASREF Jubail refinery petroleum-product specification testing",
    overlap: "PCH+ENV+INS+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "SASREF ACCOUNT is the Jubail refinery buying entity.",
    useKind: "refinery",
  },
  {
    rank: 9,
    companyName: "Yanbu Refinery Operations",
    companyId: "0fa1d9ba-cc45-4bc9-8164-cff2e5c9bcf6",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "Aramco Yanbu refinery testing — not YASREF",
    overlap: "PCH+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Distinct Aramco Yanbu refinery from YASREF.",
    useKind: "refinery",
  },
  {
    rank: 10,
    companyName: "Ras Tanura Refinery Operations",
    companyId: "d513f250-6fdc-40c2-b13f-01e51fa34976",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Ras Tanura",
    useCase: "Ras Tanura refinery petroleum-product / process testing",
    overlap: "PCH+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Named operating refinery with recurring product testing.",
    useKind: "refinery",
  },
  {
    rank: 11,
    companyName: "Jazan Refinery Operations",
    companyId: "3937ec7d-6976-4237-9f9b-ef0a1ca23152",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jazan",
    useCase: "Jazan refinery petroleum-product / process testing",
    overlap: "PCH+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Named operating refinery with recurring product testing.",
    useKind: "refinery",
  },
  {
    rank: 12,
    companyName: "Riyadh Refinery Operations",
    companyId: "3c8cb96f-0185-46d9-a30e-9b811f70affe",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Riyadh",
    useCase: "Riyadh refinery petroleum-product / process testing",
    overlap: "PCH+PET+OCM",
    verdict: "APPROVE",
    validationRationale: "Named operating refinery with recurring product testing.",
    useKind: "refinery",
  },
  {
    rank: 13,
    companyName: "Yansab Yanbu Industrial Operations",
    companyId: "16da2cd8-0139-4221-a109-77f0af480426",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Petrochemical Manufacturing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "YANSAB petrochemical product and process QC",
    overlap: "PCH+OCM",
    verdict: "APPROVE",
    validationRationale: "YANSAB operating plant; Conversion grain is not substituted in.",
    useKind: "polymer",
  },
  {
    rank: 14,
    companyName: "NATPET Yanbu Operations",
    companyId: "bb3df338-bf59-4095-9be4-95bd4bb017f0",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polypropylene",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "NATPET polypropylene product QC",
    overlap: "PCH+OCM",
    verdict: "APPROVE",
    validationRationale: "PP plant QC buyer; Alujain HQ is excluded.",
    useKind: "polymer",
  },
  {
    rank: 15,
    companyName: "Advanced Petrochemical Polypropylene Operations",
    companyId: "48cbe798-594d-4bc0-ab20-0178739f96f4",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polypropylene",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "Advanced PP plant product QC",
    overlap: "PCH+OCM",
    verdict: "APPROVE",
    validationRationale: "PP operating plant; corporate HQ is excluded.",
    useKind: "polymer",
  },
  {
    rank: 16,
    companyName: "Sadara Chemical Company",
    companyId: "ddd965a6-dffc-44dd-a9ab-732ced9a0897",
    entityGrain: "ACCOUNT",
    industry: "Chemicals",
    subsector: "Integrated Chemicals",
    customerType: "Asset Owner",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "Sadara integrated-complex third-party / overflow product QC (complex buyer)",
    overlap: "PCH+ENV+OCM",
    verdict: "APPROVE",
    validationRationale: "Complex-level lab buyer; unit rows are not substituted in.",
    useKind: "complex",
  },
  {
    rank: 17,
    companyName: "Al Jubail Petrochemical Company - Kemya Operations",
    companyId: "f955c059-326d-4040-a6e5-fca3cb6e9087",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Petrochemical Manufacturing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "Kemya petrochemical product QC",
    overlap: "PCH",
    verdict: "APPROVE",
    validationRationale: "Kemya operating plant with recurring product QC.",
    useKind: "polymer",
  },
  {
    rank: 18,
    companyName: "Eastern Petrochemical Company - Sharq Operations",
    companyId: "616e0cb4-e67f-4bbb-9a34-ba0a9bed8b3a",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Petrochemical Manufacturing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "Sharq petrochemical product QC",
    overlap: "PCH",
    verdict: "APPROVE",
    validationRationale: "Sharq operating plant with recurring product QC.",
    useKind: "polymer",
  },
  {
    rank: 19,
    companyName: "Arabian Petrochemical Company - Petrokemya Operations",
    companyId: "66b0194d-9d89-441f-b9e8-8e70baa24749",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Petrochemical Manufacturing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "Petrokemya petrochemical product QC",
    overlap: "PCH",
    verdict: "APPROVE",
    validationRationale: "Petrokemya operating plant with recurring product QC.",
    useKind: "polymer",
  },
  {
    rank: 20,
    companyName: "Sipchem Polymers Operations",
    companyId: "208ab123-da25-488d-8b35-8451fd8e895e",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polymers",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "Sipchem polymers finished-product / process QC",
    overlap: "PCH",
    verdict: "APPROVE",
    validationRationale: "One Sipchem plant in Wave-1; other Sipchem units are not substituted in.",
    useKind: "polymer",
  },
  {
    rank: 21,
    companyName: "Hawiyah Gas Plant Operations",
    companyId: "076b0bf5-193f-4994-a3ed-a5b5ba8bf63f",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Gas Processing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Hawiyah",
    useCase: "Hawiyah gas-plant hydrocarbon and process-sample laboratory testing",
    overlap: "PCH+OCM",
    verdict: "APPROVE",
    validationRationale: "Named gas plant with recurring process-sample testing.",
    useKind: "gas",
  },
] as const;

export const LAB_WAVE1_COMPANY_IDS: readonly string[] = LAB_WAVE1_ACCOUNTS.map((row) => row.companyId);

export function labWave1CompanyIdSet(): Set<string> {
  return new Set(LAB_WAVE1_COMPANY_IDS);
}

/** Facility-level group key so both Rabigh plants can be current LAB representatives. */
export function labPersistAccountGroupKey(companyId: string, liveGroupKey: string | null | undefined): string {
  if (companyId === LAB_PETRO_RABIGH_POLYMER_ID || companyId === LAB_PETRO_RABIGH_REFINING_ID) {
    return `er:v1:lab-facility:${companyId}`;
  }
  return liveGroupKey?.trim() || `er:v1:id:${companyId}`;
}

export function assertLabWave1ManifestIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (LAB_WAVE1_ACCOUNTS.length !== LAB_WAVE1_EXPECTED_COUNT) {
    errors.push(`Manifest length ${LAB_WAVE1_ACCOUNTS.length} !== ${LAB_WAVE1_EXPECTED_COUNT}`);
  }
  const ids = LAB_WAVE1_ACCOUNTS.map((row) => row.companyId);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate company_id in LAB Wave-1 manifest.");
  const names = LAB_WAVE1_ACCOUNTS.map((row) => row.companyName);
  if (new Set(names).size !== names.length) errors.push("Duplicate company_name in LAB Wave-1 manifest.");
  const ranks = LAB_WAVE1_ACCOUNTS.map((row) => row.rank);
  if (new Set(ranks).size !== ranks.length) errors.push("Duplicate rank in LAB Wave-1 manifest.");
  for (let i = 0; i < ranks.length; i += 1) {
    if (ranks[i] !== i + 1) errors.push(`LAB Wave-1 ranks must be sequential starting at 1 (index ${i}).`);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of LAB_WAVE1_ACCOUNTS) {
    if (!uuid.test(row.companyId)) errors.push(`Invalid company_id for ${row.companyName}`);
    if (row.verdict !== "APPROVE") errors.push(`Non-APPROVE row in manifest: ${row.companyName}`);
    if (row.confidence === "HIGH" && row.rank > 6) {
      errors.push(`HIGH confidence expected only for verified western facilities: ${row.companyName}`);
    }
  }
  if (!ids.includes(LAB_PETRO_RABIGH_REFINING_ID) || !ids.includes(LAB_PETRO_RABIGH_POLYMER_ID)) {
    errors.push("Both Petro Rabigh Refining and Polymer must remain frozen LAB Wave-1 ids.");
  }
  const services = [PCH_SERVICE_ID, ENV_SERVICE_ID, INS_SERVICE_ID, PET_SERVICE_ID, OCM_SERVICE_ID, LAB_SERVICE_ID];
  if (ids.some((id) => services.includes(id))) errors.push("Manifest company_id collided with a service_id.");
  return { ok: errors.length === 0, errors };
}
