import type { ServiceCode } from "./types";

export type PositioningPlaybook = {
  positioning: string;
  contactRoles: string[];
  departments: string[];
};

export const SERVICE_PLAYBOOK: Record<ServiceCode, PositioningPlaybook> = {
  PET: {
    positioning:
      "GEOCHEM petroleum inspection and testing: quantity and quality inspection, cargo and ship/shore verification, sampling, tank/terminal measurement, custody transfer, and loss control.",
    contactRoles: ["Technical", "Decision Maker"],
    departments: ["Inspection", "Laboratory", "Engineering"],
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
    positioning:
      "GEOCHEM oil analysis and condition-monitoring support for rotating equipment, lubricant health, contamination, wear detection, and predictive maintenance.",
    contactRoles: ["Technical", "Influencer", "Decision Maker"],
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
    positioning:
      "GEOCHEM laboratory and testing services for product specification, process-stream QC, and overflow/third-party analysis at operating plants.",
    contactRoles: ["Technical", "Procurement"],
    departments: ["Laboratory", "QA/QC", "Operations"],
  },
};

export function positioningFor(serviceCode: ServiceCode, companyName: string): string {
  return `For ${companyName}: ${SERVICE_PLAYBOOK[serviceCode].positioning}`;
}

export function positioningForUseCase(serviceCode: ServiceCode, companyName: string, useCase: string): string {
  if (serviceCode === "OCM" && useCase.trim()) {
    return `For ${companyName}: GEOCHEM oil analysis and condition-monitoring support for ${useCase}.`;
  }
  if (serviceCode === "LAB" && useCase.trim()) {
    return `For ${companyName}: GEOCHEM laboratory and testing services for ${useCase}.`;
  }
  return positioningFor(serviceCode, companyName);
}
