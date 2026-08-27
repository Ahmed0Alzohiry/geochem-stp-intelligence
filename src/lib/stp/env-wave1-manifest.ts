/**
 * ENV Wave-1 frozen target list (STEP 32.1.5).
 * 24 HIGH-priority accounts only. Do not add Wave-2 / hold / excluded IDs.
 * Production persist requires an explicit --write on the ENV writer.
 */

export const PCH_SERVICE_ID = "a5c12354-6cfb-4455-a50a-78bebbc51867";
export const ENV_SERVICE_ID = "164a9647-d6fd-4db0-8f9f-42e281c28ccf";
export const PCH_EXPECTED_CURRENT_COUNT = 350;
export const ENV_WAVE1_EXPECTED_COUNT = 24;
export const ENV_WAVE1_MANIFEST_VERSION = "32.1.5";

export type EnvWave1ManifestEntry = {
  rank: number;
  companyName: string;
  companyId: string;
};

export const ENV_WAVE1_ACCOUNTS: readonly EnvWave1ManifestEntry[] = [
  { rank: 1, companyName: "Alkhorayef Water & Power Technologies Co.", companyId: "0c332806-70bb-4ae6-b8b0-9130bc5fa00c" },
  { rank: 2, companyName: "Miahona Co.", companyId: "e6521e04-90b3-40b1-904f-36be8104af28" },
  { rank: 3, companyName: "Luberef Jeddah Operations", companyId: "434b1729-803c-4c10-b702-eefd669663d9" },
  { rank: 4, companyName: "Petro Rabigh Polymer Operations", companyId: "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe" },
  { rank: 5, companyName: "SAMREF Yanbu Industrial Operations", companyId: "3d9fc8b5-a439-4be7-acef-e6be121d65d0" },
  { rank: 6, companyName: "Saudi Yanbu Petrochemical Company - Yanpet Operations", companyId: "32498bc2-ccaa-4ce8-a82c-ef1f16b9fbdb" },
  { rank: 7, companyName: "YASREF Yanbu Industrial Operations", companyId: "bffc98ac-41bc-4aa2-b542-23cb477dfda7" },
  { rank: 8, companyName: "Saudi Arabian Oil Company", companyId: "89a09175-d912-4f15-b18a-279e9115bfe2" },
  { rank: 9, companyName: "Saudi Basic Industries Corporation", companyId: "2b3acff6-a289-4eb5-ac6f-a6f325330209" },
  { rank: 10, companyName: "Sahara International Petrochemical Company", companyId: "716df996-5f9e-4912-98e7-10036b17b039" },
  { rank: 11, companyName: "Saudi Aramco Total Refining and Petrochemical Company", companyId: "b243ca65-1254-45e3-83f0-ec9d74a05274" },
  { rank: 12, companyName: "Saudi Aramco Jubail Refinery Company", companyId: "e154ab7b-97e8-4672-84fe-0e22a1ad5e08" },
  { rank: 13, companyName: "National Industrialization Company", companyId: "79eb20b6-f480-46a7-b030-5e7302775d9c" },
  { rank: 14, companyName: "Sadara Chemical Company", companyId: "ddd965a6-dffc-44dd-a9ab-732ced9a0897" },
  { rank: 15, companyName: "Saudi Arabian Mining Company", companyId: "8f0805de-e2c3-4b92-9848-810e1b56a878" },
  { rank: 16, companyName: "Al Masane Al Kobra Mining Co.", companyId: "a0233335-0b85-4c10-9d3e-2fe7958b4a7e" },
  { rank: 17, companyName: "Advanced Petrochemical Company", companyId: "1387b1ec-9d5f-48cc-9512-7d1162d8f3d6" },
  { rank: 18, companyName: "ACWA Power Company", companyId: "46ada5bd-968e-4292-82e0-5a77635c4857" },
  { rank: 19, companyName: "Power and Water Utility Company for Jubail and Yanbu", companyId: "635792b8-5ec7-4d7d-aadd-ec869064bbf3" },
  { rank: 20, companyName: "Basic Chemical Industries Company", companyId: "cd7903c5-c1e5-446e-905b-1fd71adc27fb" },
  { rank: 21, companyName: "Methanol Chemicals Company", companyId: "84f7e4ec-872d-4b2e-97f2-ec53031b5b80" },
  { rank: 22, companyName: "Nama Chemicals Company", companyId: "e833ce3c-87bc-42ec-a3cd-a09f26430482" },
  { rank: 23, companyName: "Naas Petrol Factory Co.", companyId: "44398c0b-2a6a-41fb-b939-218d6eb269fc" },
  { rank: 24, companyName: "Saudi Lime Industries Co.", companyId: "a2b56c46-50b0-4af6-b4c4-57d02b7bdb1d" },
] as const;

export const ENV_WAVE1_COMPANY_IDS: readonly string[] = ENV_WAVE1_ACCOUNTS.map((row) => row.companyId);

export function envWave1CompanyIdSet(): Set<string> {
  return new Set(ENV_WAVE1_COMPANY_IDS);
}

export function assertEnvWave1ManifestIntegrity(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (ENV_WAVE1_ACCOUNTS.length !== ENV_WAVE1_EXPECTED_COUNT) {
    errors.push(`Manifest length ${ENV_WAVE1_ACCOUNTS.length} !== ${ENV_WAVE1_EXPECTED_COUNT}`);
  }
  const ids = ENV_WAVE1_ACCOUNTS.map((row) => row.companyId);
  if (new Set(ids).size !== ids.length) errors.push("Duplicate company_id in ENV Wave-1 manifest.");
  const names = ENV_WAVE1_ACCOUNTS.map((row) => row.companyName);
  if (new Set(names).size !== names.length) errors.push("Duplicate company_name in ENV Wave-1 manifest.");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const row of ENV_WAVE1_ACCOUNTS) {
    if (!uuid.test(row.companyId)) errors.push(`Invalid company_id for ${row.companyName}`);
  }
  if (ids.includes(PCH_SERVICE_ID) || ids.includes(ENV_SERVICE_ID)) {
    errors.push("Manifest company_id collided with a service_id.");
  }
  return { ok: errors.length === 0, errors };
}
