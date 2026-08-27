import type { ContactCandidate } from "./collection-rules";
import type { AccountGroupMember } from "./persist-grain";

export const PETRO_RABIGH_ACCOUNT_ID = "039f7219-431b-4467-9a89-9cdc89b1e226";
export const PETRO_RABIGH_POLYMER_ID = "bcb70c34-0c5e-4316-8f64-d4e3fb1d45fe";
export const PETRO_RABIGH_REFINING_ID = "5f42dbe1-4a16-4657-8627-1c49d4ddca84";
export const PETRO_RABIGH_GROUP_KEY = "er:v1:id:039f7219-431b-4467-9a89-9cdc89b1e226";
export const PETRO_RABIGH_POLYMER_STP_ID = "4ac13502-3cee-4527-afff-df01c55b0db6";

export const PETRO_RABIGH_GROUP: AccountGroupMember[] = [
  {
    companyId: PETRO_RABIGH_ACCOUNT_ID,
    companyName: "Rabigh Refining and Petrochemical Company",
    legalName: "Rabigh Refining and Petrochemical Company",
    entityType: "ACCOUNT",
  },
  {
    companyId: PETRO_RABIGH_POLYMER_ID,
    companyName: "Petro Rabigh Polymer Operations",
    legalName: "Rabigh Refining and Petrochemical Company (Petro Rabigh)",
    entityType: "FACILITY",
  },
  {
    companyId: PETRO_RABIGH_REFINING_ID,
    companyName: "Petro Rabigh Refining Operations",
    legalName: "Rabigh Refining and Petrochemical Company (Petro Rabigh)",
    entityType: "FACILITY",
  },
];

export const FAHAD_ALTHERWI_SOURCE_URL =
  "https://www.petrorabigh.com/en/AboutPRC/BoardAndExecutiveManagement/ExecutiveManagement/Pages/Fahad%20AlTherwi.aspx";

export const FAHAD_ALTHERWI_EVIDENCE_NOTES =
  "Official Executive Management profile. Appointed January 2024 as current role. Copied from the live page only. No email, phone, or personal LinkedIn on the source.";

export const FAHAD_ALTHERWI_PERSONA_KEY = "Engineering::technical_services";

export function fahadAlTherwiCandidate(existingAtCompany: ContactCandidate["existingAtCompany"] = []): ContactCandidate {
  return {
    serviceCode: "PCH",
    companyId: PETRO_RABIGH_POLYMER_ID,
    targetCompanyName: "Petro Rabigh Polymer Operations",
    rankedForService: true,
    fullName: "Fahad AlTherwi",
    jobTitle: "Vice President of Engineering and Support",
    departmentName: "Engineering",
    jobFunctionCode: "technical_services",
    email: null,
    phone: null,
    linkedinUrl: null,
    sourceUrl: FAHAD_ALTHERWI_SOURCE_URL,
    sourceName: "Petro Rabigh official Executive Management — Fahad AlTherwi",
    evidenceType: "Official website",
    sourceConfidence: "HIGH",
    claimedVerification: "Verified",
    verifiedAt: "2026-08-27",
    companyNameOnSource: "Petro Rabigh",
    sourceShowsCurrentRole: true,
    sourceShowsEmail: false,
    sourceShowsPhone: false,
    sourceConfirmsSameCompany: true,
    existingAtCompany,
  };
}
