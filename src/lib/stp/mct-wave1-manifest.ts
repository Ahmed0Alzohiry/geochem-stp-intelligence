/**
 * MCT Wave-1 frozen target list (STEP 32.6.3).
 * 26 APPROVE accounts from 32.6.2 (24 CORE + 2 GROWTH). Production persist requires --write
 * on the MCT writer. Do not pass --write in Step 32.6.3.
 *
 * Petro Rabigh Refining and Polymer are both frozen. They share the live ER
 * account_group_key. STP unique index is (account_group_key, service_id) for
 * current representatives, so MCT persist uses facility-scoped group keys for
 * those two company_ids only — no silent substitute of either plant.
 */

import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { LAB_SERVICE_ID } from "./lab-wave1-manifest";
import { OCM_SERVICE_ID } from "./ocm-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";

export const MCT_SERVICE_ID = "027d257c-62e1-4369-8f50-2dc76875b0ef";
export const MCT_WAVE1_EXPECTED_COUNT = 26;
export const MCT_WAVE1_MANIFEST_VERSION = "32.6.3";

export const MCT_PETRO_RABIGH_POLYMER_ID = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
export const MCT_PETRO_RABIGH_REFINING_ID = "5f42dbe1-4a16-4657-8627-1c49d4ddca84";
export const MCT_PETRO_RABIGH_ER_GROUP_KEY = "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226";

export type MctWave1Confidence = "HIGH" | "MEDIUM";
export type MctPrimaryApp = "Metering" | "Calibration" | "Multiple";
export type MctUseKind = "refinery" | "polymer" | "terminal" | "gas" | "utility" | "complex";
export type MctValidationSource = "32.6.2 CORE_A" | "32.6.2 GROWTH_B";
export type MctRegion = "Western" | "Eastern" | "Central";

export type MctWave1ManifestEntry = {
  rank: number;
  companyName: string;
  companyId: string;
  entityGrain: "FACILITY" | "ACCOUNT";
  industry: string;
  subsector: string;
  customerType: string;
  confidence: MctWave1Confidence;
  locationLabel: string;
  region: MctRegion;
  primaryApp: MctPrimaryApp;
  useCase: string;
  overlap: string;
  verdict: "APPROVE";
  validationSource: MctValidationSource;
  validationRationale: string;
  useKind: MctUseKind;
};

export const MCT_WAVE1_ACCOUNTS: readonly MctWave1ManifestEntry[] = [
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
    region: "Western",
    primaryApp: "Multiple",
    useCase: "SAMREF refinery process/fiscal metering and I&C calibration",
    overlap: "PCH+ENV+INS+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Operating Yanbu refinery with recurring fiscal/process metering and instrument calibration.",
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
    region: "Western",
    primaryApp: "Multiple",
    useCase: "YASREF refinery process/fiscal metering and I&C calibration",
    overlap: "PCH+ENV+INS+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Operating Yanbu refinery with recurring fiscal/process metering and instrument calibration.",
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
    region: "Western",
    primaryApp: "Multiple",
    useCase: "Luberef base-oil plant flow measurement and instrument calibration",
    overlap: "PCH+ENV+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Base-oil plant with flow measurement and I&C calibration demand.",
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
    region: "Western",
    primaryApp: "Calibration",
    useCase: "Yanpet process instrumentation calibration (pressure/temp/flow/level)",
    overlap: "PCH+ENV+INS+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Yanpet operating plant with recurring process-instrument calibration.",
    useKind: "polymer",
  },
  {
    rank: 5,
    companyName: "Petro Rabigh Refining Operations",
    companyId: MCT_PETRO_RABIGH_REFINING_ID,
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Rabigh",
    region: "Western",
    primaryApp: "Multiple",
    useCase: "Petro Rabigh refinery custody/process metering and calibration — independent of polymer",
    overlap: "INS+PET+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Independent refinery plant; not substituted by Polymer Operations.",
    useKind: "refinery",
  },
  {
    rank: 6,
    companyName: "Petro Rabigh Polymer Operations",
    companyId: MCT_PETRO_RABIGH_POLYMER_ID,
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polymers",
    customerType: "Prospect",
    confidence: "HIGH",
    locationLabel: "Rabigh",
    region: "Western",
    primaryApp: "Calibration",
    useCase: "Petro Rabigh polymer-plant instrument calibration — independent of refining",
    overlap: "PCH+ENV+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Independent polymer plant; not substituted by Refining Operations.",
    useKind: "polymer",
  },
  {
    rank: 7,
    companyName: "Saudi Aramco Terminal Operations Yanbu",
    companyId: "7963b17a-19a5-4b0b-8198-cf8aa068ad90",
    entityGrain: "FACILITY",
    industry: "Marine / Ports",
    subsector: "Petroleum Terminal",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    region: "Western",
    primaryApp: "Metering",
    useCase: "Aramco Yanbu petroleum terminal custody transfer / tank measurement",
    overlap: "PET",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named petroleum terminal with custody-transfer metering demand.",
    useKind: "terminal",
  },
  {
    rank: 8,
    companyName: "Saudi Aramco Terminal Operations Jeddah",
    companyId: "b1366b1d-4a30-488e-88ef-4f5faaa6ae6d",
    entityGrain: "FACILITY",
    industry: "Marine / Ports",
    subsector: "Petroleum Terminal",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jeddah",
    region: "Western",
    primaryApp: "Metering",
    useCase: "Aramco Jeddah petroleum terminal custody transfer / tank measurement",
    overlap: "PET",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named petroleum terminal with custody-transfer metering demand.",
    useKind: "terminal",
  },
  {
    rank: 9,
    companyName: "Saudi Aramco Terminal Operations Rabigh",
    companyId: "662d6207-72d1-4a14-8c7c-401c23021478",
    entityGrain: "FACILITY",
    industry: "Marine / Ports",
    subsector: "Petroleum Terminal",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Rabigh",
    region: "Western",
    primaryApp: "Metering",
    useCase: "Aramco Rabigh petroleum terminal custody transfer / tank measurement",
    overlap: "PET",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named petroleum terminal with custody-transfer metering demand.",
    useKind: "terminal",
  },
  {
    rank: 10,
    companyName: "Saudi Aramco Terminal Operations Jazan",
    companyId: "49692a39-cebd-423e-8805-93b306e4d710",
    entityGrain: "FACILITY",
    industry: "Marine / Ports",
    subsector: "Petroleum Terminal",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jazan",
    region: "Western",
    primaryApp: "Metering",
    useCase: "Aramco Jazan petroleum terminal custody transfer / tank measurement",
    overlap: "PET",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named petroleum terminal with custody-transfer metering demand.",
    useKind: "terminal",
  },
  {
    rank: 11,
    companyName: "Saudi Aramco Total Refining and Petrochemical Company",
    companyId: "b243ca65-1254-45e3-83f0-ec9d74a05274",
    entityGrain: "ACCOUNT",
    industry: "Refining",
    subsector: "Refining & Petrochemicals",
    customerType: "Asset Owner",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    region: "Eastern",
    primaryApp: "Multiple",
    useCase: "SATORP Jubail refining/petrochemical metering and calibration (ACCOUNT buying entity)",
    overlap: "PCH+ENV+INS+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "SATORP ACCOUNT is the Jubail buying entity; operations grain is excluded as duplicate.",
    useKind: "refinery",
  },
  {
    rank: 12,
    companyName: "Saudi Aramco Jubail Refinery Company",
    companyId: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08",
    entityGrain: "ACCOUNT",
    industry: "Refining",
    subsector: "Refining",
    customerType: "Asset Owner",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    region: "Eastern",
    primaryApp: "Multiple",
    useCase: "SASREF Jubail refinery fiscal/process metering and I&C calibration",
    overlap: "PCH+ENV+INS+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "SASREF ACCOUNT is the Jubail refinery buying entity.",
    useKind: "refinery",
  },
  {
    rank: 13,
    companyName: "Yanbu Refinery Operations",
    companyId: "0fa1d9ba-cc45-4bc9-8164-cff2e5c9bcf6",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    region: "Western",
    primaryApp: "Multiple",
    useCase: "Aramco Yanbu refinery metering/calibration — distinct from YASREF",
    overlap: "PCH+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Distinct Aramco Yanbu refinery from YASREF.",
    useKind: "refinery",
  },
  {
    rank: 14,
    companyName: "Jazan Refinery Operations",
    companyId: "3937ec7d-6976-4237-9f9b-ef0a1ca23152",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jazan",
    region: "Western",
    primaryApp: "Multiple",
    useCase: "Jazan refinery process/fiscal metering and instrument calibration",
    overlap: "PCH+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named operating refinery with fiscal/process metering and I&C calibration.",
    useKind: "refinery",
  },
  {
    rank: 15,
    companyName: "Ras Tanura Refinery Operations",
    companyId: "d513f250-6fdc-40c2-b13f-01e51fa34976",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Ras Tanura",
    region: "Eastern",
    primaryApp: "Multiple",
    useCase: "Ras Tanura refinery process/fiscal metering and I&C calibration",
    overlap: "PCH+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named operating refinery with fiscal/process metering and I&C calibration.",
    useKind: "refinery",
  },
  {
    rank: 16,
    companyName: "Riyadh Refinery Operations",
    companyId: "3c8cb96f-0185-46d9-a30e-9b811f70affe",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Refining",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Riyadh",
    region: "Central",
    primaryApp: "Multiple",
    useCase: "Riyadh refinery process/fiscal metering and I&C calibration",
    overlap: "PCH+PET+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Named operating refinery with fiscal/process metering and I&C calibration.",
    useKind: "refinery",
  },
  {
    rank: 17,
    companyName: "Hawiyah Gas Plant Operations",
    companyId: "076b0bf5-193f-4994-a3ed-a5b5ba8bf63f",
    entityGrain: "FACILITY",
    industry: "Oil & Gas",
    subsector: "Gas Processing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Hawiyah",
    region: "Eastern",
    primaryApp: "Multiple",
    useCase: "Hawiyah gas-plant allocation/fiscal metering and instrument calibration",
    overlap: "PCH+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "One named gas plant in Wave-1; other Aramco gas plants are not substituted in.",
    useKind: "gas",
  },
  {
    rank: 18,
    companyName: "Saudi Aramco Terminal Operations Ras Tanura",
    companyId: "4f501e4f-5989-4dcc-b407-f5d87fb3e91e",
    entityGrain: "FACILITY",
    industry: "Marine / Ports",
    subsector: "Petroleum Terminal",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Ras Tanura",
    region: "Eastern",
    primaryApp: "Metering",
    useCase: "Aramco Ras Tanura petroleum terminal custody transfer / tank measurement",
    overlap: "PET",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Eastern custody-transfer terminal; Juaymah is not substituted in.",
    useKind: "terminal",
  },
  {
    rank: 19,
    companyName: "Yansab Yanbu Industrial Operations",
    companyId: "16da2cd8-0139-4221-a109-77f0af480426",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Petrochemical Manufacturing",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    region: "Western",
    primaryApp: "Calibration",
    useCase: "YANSAB process instrumentation calibration",
    overlap: "PCH+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "YANSAB operating plant; Conversion grain is not substituted in.",
    useKind: "polymer",
  },
  {
    rank: 20,
    companyName: "NATPET Yanbu Operations",
    companyId: "bb3df338-bf59-4095-9be4-95bd4bb017f0",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polypropylene",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    region: "Western",
    primaryApp: "Calibration",
    useCase: "NATPET polypropylene plant instrument calibration",
    overlap: "PCH+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "PP plant calibration buyer; Alujain HQ is excluded.",
    useKind: "polymer",
  },
  {
    rank: 21,
    companyName: "Advanced Petrochemical Polypropylene Operations",
    companyId: "48cbe798-594d-4bc0-ab20-0178739f96f4",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polypropylene",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    region: "Eastern",
    primaryApp: "Calibration",
    useCase: "Advanced PP plant instrument calibration",
    overlap: "PCH+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "PP operating plant; corporate HQ is excluded.",
    useKind: "polymer",
  },
  {
    rank: 22,
    companyName: "Sadara Chemical Company",
    companyId: "ddd965a6-dffc-44dd-a9ab-732ced9a0897",
    entityGrain: "ACCOUNT",
    industry: "Chemicals",
    subsector: "Integrated Chemicals",
    customerType: "Asset Owner",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    region: "Eastern",
    primaryApp: "Calibration",
    useCase: "Sadara complex I&C calibration / overflow third-party calibration (ACCOUNT)",
    overlap: "PCH+ENV+OCM+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Complex-level MCT buyer; unit rows are not substituted in.",
    useKind: "complex",
  },
  {
    rank: 23,
    companyName: "Al Jubail Petrochemical Company - Kemya Operations",
    companyId: "f955c059-326d-4040-a6e5-fca3cb6e9087",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Elastomers & Petrochemicals",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    region: "Eastern",
    primaryApp: "Calibration",
    useCase: "Kemya petrochemical plant instrument calibration",
    overlap: "PCH+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "Kemya operating plant with recurring I&C calibration.",
    useKind: "polymer",
  },
  {
    rank: 24,
    companyName: "Sipchem Polymers Operations",
    companyId: "208ab123-da25-488d-8b35-8451fd8e895e",
    entityGrain: "FACILITY",
    industry: "Petrochemicals",
    subsector: "Polymers",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    region: "Eastern",
    primaryApp: "Calibration",
    useCase: "Sipchem polymers plant instrument calibration (one Sipchem Wave-1 row)",
    overlap: "PCH+LAB",
    verdict: "APPROVE",
    validationSource: "32.6.2 CORE_A",
    validationRationale: "One Sipchem plant in Wave-1; other Sipchem units are not substituted in.",
    useKind: "polymer",
  },
  {
    rank: 25,
    companyName: "ACWA Power Rabigh Operations",
    companyId: "176d8c04-170e-4098-978d-9fed3e6b8a65",
    entityGrain: "FACILITY",
    industry: "Power & Utilities",
    subsector: "Power Generation",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Rabigh",
    region: "Western",
    primaryApp: "Multiple",
    useCase: "ACWA Power Rabigh I&C calibration and energy/flow metering",
    overlap: "OCM",
    verdict: "APPROVE",
    validationSource: "32.6.2 GROWTH_B",
    validationRationale: "GROWTH promotion: western IPP with plant-level metering and calibration evidence.",
    useKind: "utility",
  },
  {
    rank: 26,
    companyName: "Yanbu Power and Desalination Plant Operations",
    companyId: "9f0a3793-52f7-45b1-b5d0-5746c7bd5768",
    entityGrain: "FACILITY",
    industry: "Power & Utilities",
    subsector: "Power & Desalination",
    customerType: "Prospect",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    region: "Western",
    primaryApp: "Multiple",
    useCase: "Yanbu power and desalination flow metering and instrument calibration",
    overlap: "OCM",
    verdict: "APPROVE",
    validationSource: "32.6.2 GROWTH_B",
    validationRationale: "GROWTH promotion: western power/desal plant with flow metering and I&C calibration.",
    useKind: "utility",
  },
] as const;

export const MCT_WAVE1_COMPANY_IDS: readonly string[] = MCT_WAVE1_ACCOUNTS.map((row) => row.companyId);

export function mctWave1CompanyIdSet(): Set<string> {
  return new Set(MCT_WAVE1_COMPANY_IDS);
}

/** Facility-level group key so both Rabigh plants can be current MCT representatives. */
export function mctPersistAccountGroupKey(companyId: string, liveGroupKey: string | null | undefined): string {
  if (companyId === MCT_PETRO_RABIGH_POLYMER_ID || companyId === MCT_PETRO_RABIGH_REFINING_ID) {
    return `er:v1:mct-facility:${companyId}`;
  }
  return liveGroupKey?.trim() || `er:v1:id:${companyId}`;
}

export function assertMctWave1ManifestIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (MCT_WAVE1_ACCOUNTS.length !== MCT_WAVE1_EXPECTED_COUNT) {
    errors.push(`Manifest length ${MCT_WAVE1_ACCOUNTS.length} !== ${MCT_WAVE1_EXPECTED_COUNT}`);
  }
  const ids = MCT_WAVE1_ACCOUNTS.map((row) => row.companyId);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate company_id in MCT Wave-1 manifest.");
  const names = MCT_WAVE1_ACCOUNTS.map((row) => row.companyName);
  if (new Set(names).size !== names.length) errors.push("Duplicate company_name in MCT Wave-1 manifest.");
  const ranks = MCT_WAVE1_ACCOUNTS.map((row) => row.rank);
  if (new Set(ranks).size !== ranks.length) errors.push("Duplicate rank in MCT Wave-1 manifest.");
  for (let i = 0; i < ranks.length; i += 1) {
    if (ranks[i] !== i + 1) errors.push(`MCT Wave-1 ranks must be sequential starting at 1 (index ${i}).`);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of MCT_WAVE1_ACCOUNTS) {
    if (!uuid.test(row.companyId)) errors.push(`Invalid company_id for ${row.companyName}`);
    if (row.verdict !== "APPROVE") errors.push(`Non-APPROVE row in manifest: ${row.companyName}`);
    if (row.confidence === "HIGH" && row.rank > 6) {
      errors.push(`HIGH confidence expected only for verified western facilities: ${row.companyName}`);
    }
    if (row.primaryApp === "Metering" && row.useKind !== "terminal") {
      errors.push(`Metering-primary Wave-1 rows must be terminals: ${row.companyName}`);
    }
  }
  if (!ids.includes(MCT_PETRO_RABIGH_REFINING_ID) || !ids.includes(MCT_PETRO_RABIGH_POLYMER_ID)) {
    errors.push("Both Petro Rabigh Refining and Polymer must remain frozen MCT Wave-1 ids.");
  }
  const growth = MCT_WAVE1_ACCOUNTS.filter((row) => row.validationSource === "32.6.2 GROWTH_B");
  if (growth.length !== 2) errors.push(`Expected 2 GROWTH promotions, got ${growth.length}`);
  const services = [
    PCH_SERVICE_ID,
    ENV_SERVICE_ID,
    INS_SERVICE_ID,
    PET_SERVICE_ID,
    OCM_SERVICE_ID,
    LAB_SERVICE_ID,
    MCT_SERVICE_ID,
  ];
  if (ids.some((id) => services.includes(id))) errors.push("Manifest company_id collided with a service_id.");
  return { ok: errors.length === 0, errors };
}
