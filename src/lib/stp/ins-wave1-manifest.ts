/**
 * INS Wave-1 frozen target list (STEP 32.2.2).
 * Production persist requires an explicit --write on the INS writer.
 * FACILITY-first. One representative per account_group. No coating/IM default cluster.
 */

import { ENV_SERVICE_ID, PCH_SERVICE_ID } from "./env-wave1-manifest";

export const INS_SERVICE_ID = "ddbbe11f-7352-4798-9546-76aff6f47944";
export const INS_WAVE1_EXPECTED_COUNT = 22;
export const INS_WAVE1_MANIFEST_VERSION = "32.2.2";
export const ENV_EXPECTED_CURRENT_COUNT = 24;

export type InsDemandCategory =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G";

export type InsWave1Confidence = "HIGH" | "MEDIUM";

export type InsWave1ManifestEntry = {
  rank: number;
  companyName: string;
  companyId: string;
  confidence: InsWave1Confidence;
  demand: readonly InsDemandCategory[];
};

export const INS_WAVE1_ACCOUNTS: readonly InsWave1ManifestEntry[] = [
  { rank: 1, companyName: "Petro Rabigh Refining Operations", companyId: "5f42dbe1-4a16-4657-8627-1c49d4ddca84", confidence: "HIGH", demand: ["A", "F"] },
  { rank: 2, companyName: "SAMREF Yanbu Industrial Operations", companyId: "3d9fc8b5-a439-4be7-acef-e6be121d65d0", confidence: "HIGH", demand: ["A", "F"] },
  { rank: 3, companyName: "YASREF Yanbu Industrial Operations", companyId: "bffc98ac-41bc-4aa2-b542-23cb477dfda7", confidence: "HIGH", demand: ["A", "F"] },
  { rank: 4, companyName: "Luberef Yanbu Base Oil Operations", companyId: "cbe0f6bc-20c6-4b1e-b2b7-cf44a8a0bb82", confidence: "HIGH", demand: ["A", "F"] },
  { rank: 5, companyName: "Saudi Yanbu Petrochemical Company - Yanpet Operations", companyId: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb", confidence: "HIGH", demand: ["A", "F"] },
  { rank: 6, companyName: "Saudi Aramco Total Refining and Petrochemical Company", companyId: "b243ca65-1254-45e3-83f0-ec9d74a05274", confidence: "MEDIUM", demand: ["A", "F"] },
  { rank: 7, companyName: "Saudi Aramco Jubail Refinery Company", companyId: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08", confidence: "MEDIUM", demand: ["A", "F"] },
  { rank: 8, companyName: "Saudi Arabian Oil Company", companyId: "89a09175-d912-4f15-b18a-279e9115bfe2", confidence: "MEDIUM", demand: ["A", "F"] },
  { rank: 9, companyName: "Saudi Basic Industries Corporation", companyId: "2b3acff6-a289-4eb5-ac6f-a6f325330209", confidence: "MEDIUM", demand: ["A"] },
  { rank: 10, companyName: "Sahara International Petrochemical Company", companyId: "716df996-5f9e-4912-98e7-10036b17b039", confidence: "MEDIUM", demand: ["A"] },
  { rank: 11, companyName: "Advanced Petrochemical Company", companyId: "1387b1ec-9d5f-48cc-9512-7d1162d8f3d6", confidence: "MEDIUM", demand: ["A"] },
  { rank: 12, companyName: "Saudi Arabian Mining Company", companyId: "8f0805de-e2c3-4b92-9848-810e1b56a878", confidence: "MEDIUM", demand: ["A", "E"] },
  { rank: 13, companyName: "Al Masane Al Kobra Mining Co.", companyId: "a0233335-0b85-4c10-9d3e-2fe7958b4a7e", confidence: "MEDIUM", demand: ["A", "E"] },
  { rank: 14, companyName: "Power and Water Utility Company for Jubail and Yanbu", companyId: "635792b8-5ec7-4d7d-aadd-ec869064bbf3", confidence: "MEDIUM", demand: ["A", "E"] },
  { rank: 15, companyName: "Saudi Lime Industries Co.", companyId: "a2b56c46-50b0-4af6-b4c4-57d02b7bdb1d", confidence: "MEDIUM", demand: ["A", "E"] },
  { rank: 16, companyName: "Technip Energies Saudi Arabia", companyId: "464f808d-ce56-4d11-b4b9-9df434ed2c74", confidence: "MEDIUM", demand: ["D", "B"] },
  { rank: 17, companyName: "Samsung E&A Saudi Arabia", companyId: "cf94af13-85f9-4229-8cbe-3a8621cabb50", confidence: "MEDIUM", demand: ["D", "B"] },
  { rank: 18, companyName: "Petrofac Saudi Arabia", companyId: "1fb00c97-b5b4-4039-94a5-c08a6d913924", confidence: "MEDIUM", demand: ["D", "B"] },
  { rank: 19, companyName: "Sinopec Engineering Group Saudi Arabia", companyId: "f747a702-9390-46e8-b6de-2c8c77bc05ef", confidence: "MEDIUM", demand: ["D", "B"] },
  { rank: 20, companyName: "Nesma & Partners Contracting Company", companyId: "6ed58c9e-3a8f-41ac-a9a0-167161867b06", confidence: "MEDIUM", demand: ["D"] },
  { rank: 21, companyName: "Arabian Bemco Contracting Company", companyId: "91903d86-dd8f-4f96-8338-6ed062a68f9e", confidence: "MEDIUM", demand: ["D", "E"] },
  { rank: 22, companyName: "Archirodon Saudi Arabia", companyId: "a4fcb1c2-675e-4b58-bc72-28cb83f31580", confidence: "MEDIUM", demand: ["D", "G"] },
] as const;

export const INS_WAVE1_COMPANY_IDS: readonly string[] = INS_WAVE1_ACCOUNTS.map((row) => row.companyId);

export function insWave1CompanyIdSet(): Set<string> {
  return new Set(INS_WAVE1_COMPANY_IDS);
}

export function assertInsWave1ManifestIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (INS_WAVE1_ACCOUNTS.length !== INS_WAVE1_EXPECTED_COUNT) {
    errors.push(`Manifest length ${INS_WAVE1_ACCOUNTS.length} !== ${INS_WAVE1_EXPECTED_COUNT}`);
  }
  const ids = INS_WAVE1_ACCOUNTS.map((row) => row.companyId);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate company_id in INS Wave-1 manifest.");
  const names = INS_WAVE1_ACCOUNTS.map((row) => row.companyName);
  if (new Set(names).size !== names.length) errors.push("Duplicate company_name in INS Wave-1 manifest.");
  const ranks = INS_WAVE1_ACCOUNTS.map((row) => row.rank);
  if (new Set(ranks).size !== ranks.length) errors.push("Duplicate rank in INS Wave-1 manifest.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of INS_WAVE1_ACCOUNTS) {
    if (!uuid.test(row.companyId)) errors.push(`Invalid company_id for ${row.companyName}`);
    if (row.confidence === "HIGH" && row.rank > 5) errors.push(`HIGH confidence expected only in top verified facilities: ${row.companyName}`);
  }
  if (ids.includes(PCH_SERVICE_ID) || ids.includes(ENV_SERVICE_ID) || ids.includes(INS_SERVICE_ID)) {
    errors.push("Manifest company_id collided with a service_id.");
  }
  return { ok: errors.length === 0, errors };
}
