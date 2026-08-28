/**
 * PET Wave-1 frozen target list (STEP 32.3.4).
 * 18 APPROVE accounts from 32.3.3. Production persist requires --write on the PET writer.
 * Rank is PET-specific (independent of PCH/ENV/INS). One company_id per row.
 */

import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";
import { INS_SERVICE_ID } from "./ins-wave1-manifest";

export const PET_SERVICE_ID = "4f2e1c0a-5dbf-42cf-9a11-112c2aad375b";
export const PET_WAVE1_EXPECTED_COUNT = 18;
export const PET_WAVE1_MANIFEST_VERSION = "32.3.4";

export type PetWave1Confidence = "HIGH" | "MEDIUM";

export type PetWave1ManifestEntry = {
  rank: number;
  companyName: string;
  companyId: string;
  confidence: PetWave1Confidence;
  locationLabel: string;
  useCase: string;
};

export const PET_WAVE1_ACCOUNTS: readonly PetWave1ManifestEntry[] = [
  {
    rank: 1,
    companyName: "Petro Rabigh Refining Operations",
    companyId: "5f42dbe1-4a16-4657-8627-1c49d4ddca84",
    confidence: "HIGH",
    locationLabel: "Rabigh",
    useCase: "Refinery quantity/quality, sampling, custody transfer",
  },
  {
    rank: 2,
    companyName: "SAMREF Yanbu Industrial Operations",
    companyId: "3d9fc8b5-a439-4be7-acef-e6be121d65d0",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "Refinery quantity/quality, ship/shore, loss control",
  },
  {
    rank: 3,
    companyName: "YASREF Yanbu Industrial Operations",
    companyId: "bffc98ac-41bc-4aa2-b542-23cb477dfda7",
    confidence: "HIGH",
    locationLabel: "Yanbu",
    useCase: "Refinery quantity/quality, ship/shore, loss control",
  },
  {
    rank: 4,
    companyName: "Luberef Jeddah Operations",
    companyId: "434b1729-803c-4c10-b702-eefd669663d9",
    confidence: "HIGH",
    locationLabel: "Jeddah",
    useCase: "Base-oil quantity/quality, tank measurement",
  },
  {
    rank: 5,
    companyName: "Saudi Aramco Terminal Operations Yanbu",
    companyId: "7963b17a-19a5-4b0b-8198-cf8aa068ad90",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "Petroleum cargo, ship/shore, tank measurement, sampling",
  },
  {
    rank: 6,
    companyName: "Saudi Aramco Terminal Operations Jeddah",
    companyId: "b1366b1d-4a30-488e-88ef-4f5faaa6ae6d",
    confidence: "MEDIUM",
    locationLabel: "Jeddah",
    useCase: "Petroleum cargo, ship/shore, tank measurement, sampling",
  },
  {
    rank: 7,
    companyName: "Saudi Aramco Terminal Operations Rabigh",
    companyId: "662d6207-72d1-4a14-8c7c-401c23021478",
    confidence: "MEDIUM",
    locationLabel: "Rabigh",
    useCase: "Petroleum cargo, ship/shore, tank measurement, sampling",
  },
  {
    rank: 8,
    companyName: "Yanbu Refinery Operations",
    companyId: "0fa1d9ba-cc45-4bc9-8164-cff2e5c9bcf6",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "Aramco Yanbu refinery quantity/quality/custody (not YASREF)",
  },
  {
    rank: 9,
    companyName: "Ras Tanura Refinery Operations",
    companyId: "d513f250-6fdc-40c2-b13f-01e51fa34976",
    confidence: "MEDIUM",
    locationLabel: "Ras Tanura",
    useCase: "Refinery quantity/quality, custody transfer",
  },
  {
    rank: 10,
    companyName: "Saudi Aramco Terminal Operations Ras Tanura",
    companyId: "4f501e4f-5989-4dcc-b407-f5d87fb3e91e",
    confidence: "MEDIUM",
    locationLabel: "Ras Tanura",
    useCase: "Export petroleum terminal cargo / ship/shore",
  },
  {
    rank: 11,
    companyName: "Jazan Refinery Operations",
    companyId: "3937ec7d-6976-4237-9f9b-ef0a1ca23152",
    confidence: "MEDIUM",
    locationLabel: "Jazan",
    useCase: "Refinery quantity/quality, custody transfer",
  },
  {
    rank: 12,
    companyName: "Saudi Aramco Total Refining and Petrochemical Company",
    companyId: "b243ca65-1254-45e3-83f0-ec9d74a05274",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "SATORP JV refinery quantity/quality/custody",
  },
  {
    rank: 13,
    companyName: "Saudi Aramco Jubail Refinery Company",
    companyId: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08",
    confidence: "MEDIUM",
    locationLabel: "Jubail",
    useCase: "SASREF refinery quantity/quality/custody",
  },
  {
    rank: 14,
    companyName: "Riyadh Refinery Operations",
    companyId: "3c8cb96f-0185-46d9-a30e-9b811f70affe",
    confidence: "MEDIUM",
    locationLabel: "Riyadh",
    useCase: "Inland refinery quantity/quality/custody",
  },
  {
    rank: 15,
    companyName: "Saudi Aramco Bulk Plant Jeddah",
    companyId: "4febb767-2853-4933-9a19-2c7a62f7033a",
    confidence: "MEDIUM",
    locationLabel: "Jeddah",
    useCase: "Tank farm / depot quantity and quality",
  },
  {
    rank: 16,
    companyName: "Saudi Aramco Bulk Plant Yanbu",
    companyId: "efe6b37c-4ade-4aec-aa73-0a049108b39a",
    confidence: "MEDIUM",
    locationLabel: "Yanbu",
    useCase: "Tank farm / depot quantity and quality",
  },
  {
    rank: 17,
    companyName: "Saudi Aramco Terminal Operations Juaymah",
    companyId: "4faa1096-d6ac-478f-9d44-fc9167fe4d31",
    confidence: "MEDIUM",
    locationLabel: "Juaymah",
    useCase: "Marine petroleum terminal cargo / ship/shore",
  },
  {
    rank: 18,
    companyName: "Saudi Aramco Terminal Operations Jazan",
    companyId: "49692a39-cebd-423e-8805-93b306e4d710",
    confidence: "MEDIUM",
    locationLabel: "Jazan",
    useCase: "Marine petroleum terminal cargo / ship/shore",
  },
] as const;

export const PET_WAVE1_COMPANY_IDS: readonly string[] = PET_WAVE1_ACCOUNTS.map((row) => row.companyId);

export function petWave1CompanyIdSet(): Set<string> {
  return new Set(PET_WAVE1_COMPANY_IDS);
}

export function assertPetWave1ManifestIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (PET_WAVE1_ACCOUNTS.length !== PET_WAVE1_EXPECTED_COUNT) {
    errors.push(`Manifest length ${PET_WAVE1_ACCOUNTS.length} !== ${PET_WAVE1_EXPECTED_COUNT}`);
  }
  const ids = PET_WAVE1_ACCOUNTS.map((row) => row.companyId);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate company_id in PET Wave-1 manifest.");
  const names = PET_WAVE1_ACCOUNTS.map((row) => row.companyName);
  if (new Set(names).size !== names.length) errors.push("Duplicate company_name in PET Wave-1 manifest.");
  const ranks = PET_WAVE1_ACCOUNTS.map((row) => row.rank);
  if (new Set(ranks).size !== ranks.length) errors.push("Duplicate rank in PET Wave-1 manifest.");
  for (let i = 0; i < ranks.length; i += 1) {
    if (ranks[i] !== i + 1) errors.push(`PET Wave-1 ranks must be sequential starting at 1 (index ${i}).`);
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of PET_WAVE1_ACCOUNTS) {
    if (!uuid.test(row.companyId)) errors.push(`Invalid company_id for ${row.companyName}`);
    if (row.confidence === "HIGH" && row.rank > 4) {
      errors.push(`HIGH confidence expected only for verified western facilities: ${row.companyName}`);
    }
  }
  if (ids.includes(PCH_SERVICE_ID) || ids.includes(ENV_SERVICE_ID) || ids.includes(INS_SERVICE_ID) || ids.includes(PET_SERVICE_ID)) {
    errors.push("Manifest company_id collided with a service_id.");
  }
  return { ok: errors.length === 0, errors };
}
