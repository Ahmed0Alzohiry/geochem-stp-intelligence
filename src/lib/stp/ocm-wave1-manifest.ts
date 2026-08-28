/**
 * OCM Wave-1 frozen target list (STEP 32.4.3).
 * 25 APPROVE accounts from 32.4.2. Production persist requires --write on the OCM writer.
 * Rank is OCM-specific. One company_id per row. One row per account_group_key.
 *
 * Petro Rabigh: Refining Operations (5f42dbe1-…) and Polymer Operations (bcb70c34-…)
 * are distinct FACILITY records (refinery vs polymer) with independent rotating-equipment
 * OCM demand, but they share account_group_key er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226.
 * STP current allows one representative per group. Wave-1 freezes Polymer (32.4.2 APPROVE,
 * HIGH Rabigh, PCH rank-1). Refining is not added (would duplicate the group and raise count).
 */

import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";
import { PET_SERVICE_ID } from "./pet-wave1-manifest";

export const OCM_SERVICE_ID = "a1bf8114-60b9-43c2-8018-7d4f0dbd4f86";
export const OCM_WAVE1_EXPECTED_COUNT = 25;
export const OCM_WAVE1_MANIFEST_VERSION = "32.4.3";
export const PET_EXPECTED_CURRENT_COUNT = 18;

export const OCM_PETRO_RABIGH_POLYMER_ID = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
export const OCM_PETRO_RABIGH_REFINING_ID = "5f42dbe1-4a16-4657-8627-1c49d4ddca84";
export const OCM_PETRO_RABIGH_GROUP_KEY = "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226";

export type OcmWave1Confidence = "HIGH" | "MEDIUM";

export type OcmWave1ManifestEntry = {
  rank: number;
  companyName: string;
  companyId: string;
  confidence: OcmWave1Confidence;
  locationLabel: string;
  useCase: string;
  overlap: string;
};

export const OCM_WAVE1_ACCOUNTS: readonly OcmWave1ManifestEntry[] = [
  {
    rank: 1,
    companyName: "SAMREF Yanbu Industrial Operations",
    companyId: "3d9fc8b5-a439-4be7-acef-e6be121d65d0",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "refinery turbines, compressors, pumps, and circulating lube systems",
    overlap: "PCH+ENV+INS+PET",
  },
  {
    rank: 2,
    companyName: "YASREF Yanbu Industrial Operations",
    companyId: "bffc98ac-41bc-4aa2-b542-23cb477dfda7",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "refinery turbines, compressors, pumps, and circulating lube systems",
    overlap: "PCH+ENV+INS+PET",
  },
  {
    rank: 3,
    companyName: "Luberef Jeddah Operations",
    companyId: "434b1729-803c-4c10-b702-eefd669663d9",
    confidence: "HIGH",
    locationLabel: "Jeddah",
    useCase: "base-oil plant rotating equipment and industrial lubrication systems",
    overlap: "PCH+ENV+PET",
  },
  {
    rank: 4,
    companyName: "Saudi Yanbu Petrochemical Company - Yanpet Operations",
    companyId: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "petrochemical compressors, turbines, extruders, and gearboxes",
    overlap: "PCH+ENV+INS",
  },
  {
    rank: 5,
    companyName: "Petro Rabigh Polymer Operations",
    companyId: OCM_PETRO_RABIGH_POLYMER_ID,
    confidence: "HIGH",
    locationLabel: "Rabigh",
    useCase: "polymer-plant compressors, extruder gearboxes, and hydraulic systems",
    overlap: "PCH+ENV",
  },
  {
    rank: 6,
    companyName: "Saudi Aramco Total Refining and Petrochemical Company",
    companyId: "b243ca65-1254-45e3-83f0-ec9d74a05274",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "SATORP refinery and petrochemical rotating equipment / lube CBM",
    overlap: "PCH+ENV+INS+PET",
  },
  {
    rank: 7,
    companyName: "Saudi Aramco Jubail Refinery Company",
    companyId: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "SASREF refinery turbines, compressors, pumps, and lube consoles",
    overlap: "PCH+ENV+INS+PET",
  },
  {
    rank: 8,
    companyName: "Yanbu Refinery Operations",
    companyId: "0fa1d9ba-cc45-4bc9-8164-cff2e5c9bcf6",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "Aramco Yanbu refinery rotating equipment / lube CBM (not YASREF)",
    overlap: "PCH+PET",
  },
  {
    rank: 9,
    companyName: "Ras Tanura Refinery Operations",
    companyId: "d513f250-6fdc-40c2-b13f-01e51fa34976",
    confidence: "MEDIUM",
    locationLabel: "Ras Tanura",
    useCase: "Ras Tanura refinery turbines, compressors, and pumps",
    overlap: "PCH+PET",
  },
  {
    rank: 10,
    companyName: "Jazan Refinery Operations",
    companyId: "3937ec7d-6976-4237-9f9b-ef0a1ca23152",
    confidence: "MEDIUM",
    locationLabel: "Jazan",
    useCase: "Jazan refinery rotating equipment / lube CBM",
    overlap: "PCH+PET",
  },
  {
    rank: 11,
    companyName: "Riyadh Refinery Operations",
    companyId: "3c8cb96f-0185-46d9-a30e-9b811f70affe",
    confidence: "MEDIUM",
    locationLabel: "Riyadh",
    useCase: "inland refinery rotating equipment / lube CBM",
    overlap: "PCH+PET",
  },
  {
    rank: 12,
    companyName: "Yansab Yanbu Industrial Operations",
    companyId: "16da2cd8-0139-4221-a109-77f0af480426",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "YANSAB petrochemical compressors, turbines, and gearboxes",
    overlap: "PCH",
  },
  {
    rank: 13,
    companyName: "NATPET Yanbu Operations",
    companyId: "bb3df338-bf59-4095-9be4-95bd4bb017f0",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "polypropylene compressors, extruders, and gearboxes",
    overlap: "PCH",
  },
  {
    rank: 14,
    companyName: "Advanced Petrochemical Polypropylene Operations",
    companyId: "48cbe798-594d-4bc0-ab20-0178739f96f4",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "polypropylene compressors, extruders, and gearboxes",
    overlap: "PCH",
  },
  {
    rank: 15,
    companyName: "Sadara Chemical Company",
    companyId: "ddd965a6-dffc-44dd-a9ab-732ced9a0897",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "integrated chemical-complex compressors, turbines, and pumps",
    overlap: "PCH+ENV",
  },
  {
    rank: 16,
    companyName: "ACWA Power Rabigh Operations",
    companyId: "176d8c04-170e-4098-978d-9fed3e6b8a65",
    confidence: "MEDIUM",
    locationLabel: "Rabigh",
    useCase: "IWPP gas/steam turbine lube oil and hydraulic control oil",
    overlap: "none",
  },
  {
    rank: 17,
    companyName: "Jeddah South Thermal Power Plant Operations",
    companyId: "f19018f4-9091-4645-b057-f1ebb3e5d03e",
    confidence: "MEDIUM",
    locationLabel: "Jeddah",
    useCase: "thermal power-plant turbine lube oil",
    overlap: "none",
  },
  {
    rank: 18,
    companyName: "Yanbu Power and Desalination Plant Operations",
    companyId: "9f0a3793-52f7-45b1-b5d0-5746c7bd5768",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "power turbines plus desalination high-pressure pumps",
    overlap: "none",
  },
  {
    rank: 19,
    companyName: "Qurayyah Independent Power Plant",
    companyId: "535d71db-1f15-4038-9817-4bd926785da1",
    confidence: "MEDIUM",
    locationLabel: "Qurayyah",
    useCase: "combined-cycle turbine lube oil",
    overlap: "none",
  },
  {
    rank: 20,
    companyName: "Hawiyah Gas Plant Operations",
    companyId: "076b0bf5-193f-4994-a3ed-a5b5ba8bf63f",
    confidence: "MEDIUM",
    locationLabel: "Hawiyah",
    useCase: "gas-plant compressors and turbines",
    overlap: "PCH",
  },
  {
    rank: 21,
    companyName: "Wasit Gas Plant Operations",
    companyId: "f0a735b6-95e4-4e61-b142-3d16df48520c",
    confidence: "MEDIUM",
    locationLabel: "Wasit",
    useCase: "gas-plant compressors and turbines",
    overlap: "PCH",
  },
  {
    rank: 22,
    companyName: "Fadhili Gas Plant Operations",
    companyId: "d4eb2f8f-429e-4115-9015-35d48907326e",
    confidence: "MEDIUM",
    locationLabel: "Fadhili",
    useCase: "gas-plant compressors and turbines",
    overlap: "PCH",
  },
  {
    rank: 23,
    companyName: "Yanbu Cement Company Yanbu Plant",
    companyId: "9aee691d-b29c-47a7-b222-2502bbcd4c8e",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "cement kiln/mill gearboxes and hydraulic systems",
    overlap: "none",
  },
  {
    rank: 24,
    companyName: "Arabian Cement Company Rabigh",
    companyId: "841db123-0ef9-42e8-bd52-73deda98f08b",
    confidence: "MEDIUM",
    locationLabel: "Rabigh",
    useCase: "cement kiln/mill gearboxes and hydraulic systems",
    overlap: "none",
  },
  {
    rank: 25,
    companyName: "Jeddah Steel Rolling Mill Operations",
    companyId: "f3adf49a-2232-493b-bbdb-a4c9d0b2a2c9",
    confidence: "MEDIUM",
    locationLabel: "Jeddah",
    useCase: "rolling-mill gearboxes and hydraulic systems",
    overlap: "none",
  },
] as const;

export const OCM_WAVE1_COMPANY_IDS: readonly string[] = OCM_WAVE1_ACCOUNTS.map((row) => row.companyId);

export function ocmWave1CompanyIdSet(): Set<string> {
  return new Set(OCM_WAVE1_COMPANY_IDS);
}

export function assertOcmWave1ManifestIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (OCM_WAVE1_ACCOUNTS.length !== OCM_WAVE1_EXPECTED_COUNT) {
    errors.push(`Manifest length ${OCM_WAVE1_ACCOUNTS.length} !== ${OCM_WAVE1_EXPECTED_COUNT}`);
  }
  const ids = OCM_WAVE1_ACCOUNTS.map((row) => row.companyId);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate company_id in OCM Wave-1 manifest.");
  const names = OCM_WAVE1_ACCOUNTS.map((row) => row.companyName);
  if (new Set(names).size !== names.length) errors.push("Duplicate company_name in OCM Wave-1 manifest.");
  const ranks = OCM_WAVE1_ACCOUNTS.map((row) => row.rank);
  if (new Set(ranks).size !== ranks.length) errors.push("Duplicate rank in OCM Wave-1 manifest.");
  for (let i = 0; i < ranks.length; i += 1) {
    if (ranks[i] !== i + 1) errors.push(`OCM Wave-1 ranks must be sequential starting at 1 (index ${i}).`);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of OCM_WAVE1_ACCOUNTS) {
    if (!uuid.test(row.companyId)) errors.push(`Invalid company_id for ${row.companyName}`);
    if (row.confidence === "HIGH" && row.rank > 5) {
      errors.push(`HIGH confidence expected only for verified western facilities: ${row.companyName}`);
    }
  }
  if (ids.includes(OCM_PETRO_RABIGH_REFINING_ID)) {
    errors.push("Petro Rabigh Refining must not be a second Wave-1 row; it shares the Polymer account group.");
  }
  if (!ids.includes(OCM_PETRO_RABIGH_POLYMER_ID)) {
    errors.push("Petro Rabigh Polymer Operations must remain the Wave-1 Rabigh representative.");
  }
  const services = [PCH_SERVICE_ID, ENV_SERVICE_ID, INS_SERVICE_ID, PET_SERVICE_ID, OCM_SERVICE_ID];
  if (ids.some((id) => services.includes(id))) {
    errors.push("Manifest company_id collided with a service_id.");
  }
  return { ok: errors.length === 0, errors };
}
