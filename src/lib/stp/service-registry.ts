/**
 * Canonical GEOCHEM service registry for STP, targeting, dashboard, and personas.
 * Live catalog rows come from public.services. Do not invent services.
 * PCH is the only persistence-approved / persona-approved reference.
 */
import type { ServiceCode } from "./types";
import { SERVICE_ELIGIBLE_INDUSTRIES } from "./eligibility";
import { SERVICE_PLAYBOOK } from "./positioning";
import { COMMERCIAL_WEIGHTS, TIER_THRESHOLDS, KNOWN_WEIGHT_FLOOR } from "./weights";
import { personasForService } from "../contacts/service-persona-map";

export const DEFAULT_SERVICE_CODE: ServiceCode = "PCH";

export const CANONICAL_SERVICE_CODES: readonly ServiceCode[] = [
  "PET",
  "PCH",
  "MIN",
  "ENV",
  "OCM",
  "MCT",
  "INS",
  "LAB",
];

export type ServiceReadiness = "CONFIGURED" | "NOT_CONFIGURED";

export type CanonicalServiceDefinition = {
  serviceCode: ServiceCode;
  /** 6.4.0 engine has eligibility + industry tables for this code. Not a persist approval. */
  scoringModelPresent: boolean;
  /** Only PCH has an independently validated, persisted ranking. */
  persistenceApproved: boolean;
  personasApproved: boolean;
  eligibleIndustries: string[];
  positioning: string;
  commercialWeights: typeof COMMERCIAL_WEIGHTS;
  tierThresholds: typeof TIER_THRESHOLDS;
  knownWeightFloor: typeof KNOWN_WEIGHT_FLOOR;
};

export function isServiceCode(value: string | null | undefined): value is ServiceCode {
  return CANONICAL_SERVICE_CODES.includes((value ?? "").toUpperCase() as ServiceCode);
}

export function normalizeServiceCode(value: string | null | undefined): ServiceCode {
  const upper = (value ?? "").toUpperCase();
  return isServiceCode(upper) ? upper : DEFAULT_SERVICE_CODE;
}

export function getCanonicalServiceDefinition(code: ServiceCode): CanonicalServiceDefinition {
  const persistenceApproved = code === "PCH";
  return {
    serviceCode: code,
    scoringModelPresent: Boolean(SERVICE_ELIGIBLE_INDUSTRIES[code]),
    persistenceApproved,
    personasApproved: code === "PCH" && personasForService("PCH").length > 0,
    eligibleIndustries: [...SERVICE_ELIGIBLE_INDUSTRIES[code]].sort(),
    positioning: SERVICE_PLAYBOOK[code].positioning,
    commercialWeights: COMMERCIAL_WEIGHTS,
    tierThresholds: TIER_THRESHOLDS,
    knownWeightFloor: KNOWN_WEIGHT_FLOOR,
  };
}

export function serviceReadiness(code: ServiceCode): ServiceReadiness {
  const def = getCanonicalServiceDefinition(code);
  return def.persistenceApproved ? "CONFIGURED" : "NOT_CONFIGURED";
}

export function rankingAvailable(code: ServiceCode, persistedCurrentCount: number): boolean {
  return serviceReadiness(code) === "CONFIGURED" && persistedCurrentCount > 0;
}

export type LiveCatalogService = {
  id: string;
  name: string;
  service_code: string | null;
  active: boolean;
};

export type RegisteredService = LiveCatalogService & {
  serviceCode: ServiceCode | null;
  readiness: ServiceReadiness | "UNKNOWN_CATALOG";
  persistenceApproved: boolean;
  personasApproved: boolean;
  scoringModelPresent: boolean;
  personaCount: number;
};

export function registerLiveServices(rows: LiveCatalogService[]): RegisteredService[] {
  return rows
    .filter((row) => row.active)
    .map((row) => {
      const code = (row.service_code ?? "").toUpperCase();
      if (!isServiceCode(code)) {
        return {
          ...row,
          serviceCode: null,
          readiness: "UNKNOWN_CATALOG" as const,
          persistenceApproved: false,
          personasApproved: false,
          scoringModelPresent: false,
          personaCount: 0,
        };
      }
      const def = getCanonicalServiceDefinition(code);
      return {
        ...row,
        serviceCode: code,
        readiness: serviceReadiness(code),
        persistenceApproved: def.persistenceApproved,
        personasApproved: def.personasApproved,
        scoringModelPresent: def.scoringModelPresent,
        personaCount: personasForService(code).length,
      };
    })
    .sort((a, b) => {
      if (a.serviceCode === "PCH") return -1;
      if (b.serviceCode === "PCH") return 1;
      return (a.service_code ?? a.name).localeCompare(b.service_code ?? b.name);
    });
}

export function validateServiceRegistry(rows: LiveCatalogService[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const codes = rows.filter((row) => row.active && row.service_code).map((row) => row.service_code!.toUpperCase());
  if (!codes.includes("PCH")) errors.push("Live catalog is missing active PCH.");
  const dup = codes.filter((code, index) => codes.indexOf(code) !== index);
  if (dup.length > 0) errors.push(`Duplicate service_code in catalog: ${[...new Set(dup)].join(", ")}`);
  for (const code of CANONICAL_SERVICE_CODES) {
    const def = getCanonicalServiceDefinition(code);
    if (!def.scoringModelPresent) errors.push(`${code} missing scoring model tables.`);
  }
  if (!getCanonicalServiceDefinition("PCH").persistenceApproved) errors.push("PCH must remain persistence-approved.");
  if (personasForService("PCH").length !== 8) errors.push("PCH must keep 8 personas.");
  for (const code of CANONICAL_SERVICE_CODES) {
    if (code === "PCH") continue;
    if (personasForService(code).length > 0) errors.push(`${code} personas were invented; keep empty until approved.`);
    if (getCanonicalServiceDefinition(code).persistenceApproved) {
      errors.push(`${code} must not be persistence-approved until independently validated.`);
    }
  }
  return { ok: errors.length === 0, errors };
}
