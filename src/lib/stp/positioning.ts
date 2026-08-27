import type { ServiceCode } from "./types";

export type PositioningPlaybook = {
  positioning: string;
  contactRoles: string[];
  departments: string[];
};

export const SERVICE_PLAYBOOK: Record<ServiceCode, PositioningPlaybook> = {
  PET: {
    positioning:
      "GEOCHEM petroleum geochemistry and reservoir-fluid support for hydrocarbon producing and processing operations.",
    contactRoles: ["Technical", "Decision Maker"],
    departments: ["Laboratory", "Engineering", "Projects"],
  },
  PCH: {
    positioning:
      "GEOCHEM process chemistry, product-quality, and hydrocarbon-stream laboratory support for refining, petrochemical, and oil & gas processing operations.",
    contactRoles: ["Technical", "Procurement"],
    departments: ["QA/QC", "Laboratory", "Engineering"],
  },
  MIN: {
    positioning: "GEOCHEM minerals and ore analysis for mining, industrial minerals, and related processing sites.",
    contactRoles: ["Technical", "Decision Maker"],
    departments: ["Laboratory", "QA/QC", "Projects"],
  },
  ENV: {
    positioning:
      "GEOCHEM environmental testing for soil, water, wastewater, and compliance monitoring at industrial sites.",
    contactRoles: ["Technical", "Influencer"],
    departments: ["Environment", "HSE", "Laboratory"],
  },
  OCM: {
    positioning: "GEOCHEM oil condition monitoring for rotating equipment reliability and lubricant programs.",
    contactRoles: ["Technical", "Influencer"],
    departments: ["Reliability", "Maintenance", "Laboratory"],
  },
  MCT: {
    positioning: "GEOCHEM metering, calibration, and related measurement support for industrial and hydrocarbon sites.",
    contactRoles: ["Technical", "Procurement"],
    departments: ["Engineering", "Inspection", "Projects"],
  },
  INS: {
    positioning: "GEOCHEM industrial inspection programs for plants, pipelines, and integrity-critical assets.",
    contactRoles: ["Technical", "Decision Maker"],
    departments: ["Inspection", "Reliability", "QA/QC"],
  },
  LAB: {
    positioning: "GEOCHEM laboratory and QA/QC testing as a general analytical partner for industrial operations.",
    contactRoles: ["Technical", "Procurement"],
    departments: ["Laboratory", "QA/QC", "HSE"],
  },
};

export function positioningFor(serviceCode: ServiceCode, companyName: string): string {
  return `For ${companyName}: ${SERVICE_PLAYBOOK[serviceCode].positioning}`;
}
