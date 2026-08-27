import type { ServiceCode } from "../stp/types";
import type { ServiceBuyingRole } from "../../types/contact-intelligence";

export const SERVICE_PERSONA_MAP_VERSION = "7.4.0";

/** Live master-data department names (migration 002). Do not invent people. */
export const SEEDED_DEPARTMENT_NAMES = [
  "Procurement",
  "QA/QC",
  "Laboratory",
  "Reliability",
  "Maintenance",
  "HSE",
  "Environment",
  "Inspection",
  "Projects",
  "Engineering",
] as const;

export type SeededDepartmentName = (typeof SEEDED_DEPARTMENT_NAMES)[number];

export const JOB_FUNCTION_CATALOG = [
  { functionCode: "laboratory", name: "Laboratory", description: "Site or central lab operations and product-quality testing." },
  { functionCode: "quality", name: "Quality", description: "QA/QC, specifications, and product-release quality." },
  { functionCode: "inspection", name: "Inspection", description: "Inspection and integrity programs that specify testing." },
  { functionCode: "operations", name: "Operations", description: "Plant/process operations that consume lab and quality data." },
  { functionCode: "technical_services", name: "Technical Services", description: "Process/technical services and plant support engineering." },
  { functionCode: "procurement", name: "Procurement", description: "Purchasing and vendor selection for laboratory services." },
  { functionCode: "contracts", name: "Contracts", description: "Contracts and frame-agreement owners for third-party labs." },
  { functionCode: "commercial", name: "Commercial / Vendor Management", description: "Commercial and vendor-management counterparts." },
] as const;

export type JobFunctionCode = (typeof JOB_FUNCTION_CATALOG)[number]["functionCode"];

export type ServiceContactPersona = {
  serviceCode: ServiceCode;
  departmentName: SeededDepartmentName;
  jobFunctionCode: JobFunctionCode;
  jobFunctionName: string;
  buyingRole: ServiceBuyingRole;
  /** 1 = primary target. */
  priority: 1 | 2 | 3;
  relevanceScore: number;
  relevanceReason: string;
};

function persona(
  partial: Omit<ServiceContactPersona, "serviceCode" | "jobFunctionName"> & { jobFunctionCode: JobFunctionCode },
): ServiceContactPersona {
  const job = JOB_FUNCTION_CATALOG.find((item) => item.functionCode === partial.jobFunctionCode);
  if (!job) throw new Error(`Unknown job function ${partial.jobFunctionCode}`);
  return {
    ...partial,
    serviceCode: "PCH",
    jobFunctionName: job.name,
  };
}

/** PCH reference personas. Not people. Not contact rows. */
export const PCH_CONTACT_PERSONAS: ServiceContactPersona[] = [
  persona({
    departmentName: "Laboratory",
    jobFunctionCode: "laboratory",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 100,
    relevanceReason: "PCH work is process chemistry and product-quality laboratory support; lab owners specify and receive results.",
  }),
  persona({
    departmentName: "QA/QC",
    jobFunctionCode: "quality",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 95,
    relevanceReason: "Product-quality and specification control is a primary PCH buying and user function.",
  }),
  persona({
    departmentName: "Engineering",
    jobFunctionCode: "technical_services",
    buyingRole: "TECHNICAL",
    priority: 2,
    relevanceScore: 85,
    relevanceReason: "Process/technical services influence assay, stream, and troubleshooting lab work.",
  }),
  persona({
    departmentName: "Inspection",
    jobFunctionCode: "inspection",
    buyingRole: "TECHNICAL",
    priority: 2,
    relevanceScore: 80,
    relevanceReason: "Inspection programs generate sampling and third-party testing demand adjacent to PCH.",
  }),
  persona({
    departmentName: "Procurement",
    jobFunctionCode: "procurement",
    buyingRole: "PROCUREMENT",
    priority: 1,
    relevanceScore: 90,
    relevanceReason: "Vendor selection and PO ownership for contracted laboratory services.",
  }),
  persona({
    departmentName: "Procurement",
    jobFunctionCode: "contracts",
    buyingRole: "PROCUREMENT",
    priority: 2,
    relevanceScore: 78,
    relevanceReason: "Frame agreements and lab-service contracts sit with procurement/contracts counterparts.",
  }),
  persona({
    departmentName: "Engineering",
    jobFunctionCode: "operations",
    buyingRole: "USER",
    priority: 3,
    relevanceScore: 72,
    relevanceReason: "Operations consumes lab data; no separate Operations department in the current catalog, so Engineering is the host department.",
  }),
  persona({
    departmentName: "Procurement",
    jobFunctionCode: "commercial",
    buyingRole: "GATEKEEPER",
    priority: 3,
    relevanceScore: 70,
    relevanceReason: "Vendor-management / commercial gatekeeping for approved laboratory suppliers. No Commercial department in the current catalog.",
  }),
];

export const SERVICE_CONTACT_PERSONAS: Record<ServiceCode, ServiceContactPersona[]> = {
  PCH: PCH_CONTACT_PERSONAS,
  PET: [],
  MIN: [],
  ENV: [],
  OCM: [],
  MCT: [],
  INS: [],
  LAB: [],
};

export function personasForService(serviceCode: string): ServiceContactPersona[] {
  const code = serviceCode.toUpperCase() as ServiceCode;
  return SERVICE_CONTACT_PERSONAS[code] ?? [];
}

export function validateServicePersonaMap(): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const depts = new Set<string>(SEEDED_DEPARTMENT_NAMES);
  const codes = new Set(JOB_FUNCTION_CATALOG.map((item) => item.functionCode));
  const pch = SERVICE_CONTACT_PERSONAS.PCH;
  if (pch.length === 0) errors.push("PCH persona map is empty.");
  const keys = new Set<string>();
  for (const row of pch) {
    if (!depts.has(row.departmentName)) errors.push(`PCH department not in seeded catalog: ${row.departmentName}`);
    if (!codes.has(row.jobFunctionCode)) errors.push(`PCH unknown job function: ${row.jobFunctionCode}`);
    if (row.relevanceScore < 0 || row.relevanceScore > 100) errors.push(`PCH bad relevance_score for ${row.jobFunctionCode}`);
    const key = `${row.departmentName}::${row.jobFunctionCode}`;
    if (keys.has(key)) errors.push(`PCH duplicate persona ${key}`);
    keys.add(key);
  }
  const hasLab = pch.some((row) => row.jobFunctionCode === "laboratory" && row.priority === 1);
  const hasQuality = pch.some((row) => row.jobFunctionCode === "quality" && row.priority === 1);
  const hasProc = pch.some((row) => row.jobFunctionCode === "procurement" && row.buyingRole === "PROCUREMENT");
  if (!hasLab) errors.push("PCH missing priority-1 laboratory persona.");
  if (!hasQuality) errors.push("PCH missing priority-1 quality persona.");
  if (!hasProc) errors.push("PCH missing procurement persona.");
  return { ok: errors.length === 0, errors };
}
