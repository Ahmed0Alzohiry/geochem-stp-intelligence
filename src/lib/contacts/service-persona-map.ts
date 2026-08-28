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
  serviceCode: ServiceCode,
  partial: Omit<ServiceContactPersona, "serviceCode" | "jobFunctionName"> & { jobFunctionCode: JobFunctionCode },
): ServiceContactPersona {
  const job = JOB_FUNCTION_CATALOG.find((item) => item.functionCode === partial.jobFunctionCode);
  if (!job) throw new Error(`Unknown job function ${partial.jobFunctionCode}`);
  return {
    ...partial,
    serviceCode,
    jobFunctionName: job.name,
  };
}

/** PCH reference personas. Not people. Not contact rows. */
export const PCH_CONTACT_PERSONAS: ServiceContactPersona[] = [
  persona("PCH", {
    departmentName: "Laboratory",
    jobFunctionCode: "laboratory",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 100,
    relevanceReason: "PCH work is process chemistry and product-quality laboratory support; lab owners specify and receive results.",
  }),
  persona("PCH", {
    departmentName: "QA/QC",
    jobFunctionCode: "quality",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 95,
    relevanceReason: "Product-quality and specification control is a primary PCH buying and user function.",
  }),
  persona("PCH", {
    departmentName: "Engineering",
    jobFunctionCode: "technical_services",
    buyingRole: "TECHNICAL",
    priority: 2,
    relevanceScore: 85,
    relevanceReason: "Process/technical services influence assay, stream, and troubleshooting lab work.",
  }),
  persona("PCH", {
    departmentName: "Inspection",
    jobFunctionCode: "inspection",
    buyingRole: "TECHNICAL",
    priority: 2,
    relevanceScore: 80,
    relevanceReason: "Inspection programs generate sampling and third-party testing demand adjacent to PCH.",
  }),
  persona("PCH", {
    departmentName: "Procurement",
    jobFunctionCode: "procurement",
    buyingRole: "PROCUREMENT",
    priority: 1,
    relevanceScore: 90,
    relevanceReason: "Vendor selection and PO ownership for contracted laboratory services.",
  }),
  persona("PCH", {
    departmentName: "Procurement",
    jobFunctionCode: "contracts",
    buyingRole: "PROCUREMENT",
    priority: 2,
    relevanceScore: 78,
    relevanceReason: "Frame agreements and lab-service contracts sit with procurement/contracts counterparts.",
  }),
  persona("PCH", {
    departmentName: "Engineering",
    jobFunctionCode: "operations",
    buyingRole: "USER",
    priority: 3,
    relevanceScore: 72,
    relevanceReason: "Operations consumes lab data; no separate Operations department in the current catalog, so Engineering is the host department.",
  }),
  persona("PCH", {
    departmentName: "Procurement",
    jobFunctionCode: "commercial",
    buyingRole: "GATEKEEPER",
    priority: 3,
    relevanceScore: 70,
    relevanceReason: "Vendor-management / commercial gatekeeping for approved laboratory suppliers. No Commercial department in the current catalog.",
  }),
];

/** ENV Wave-1 personas. Not people. Not contact rows. No Sustainability department in the seeded catalog. */
export const ENV_CONTACT_PERSONAS: ServiceContactPersona[] = [
  persona("ENV", {
    departmentName: "Environment",
    jobFunctionCode: "technical_services",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 100,
    relevanceReason: "Environmental managers specify soil, water, wastewater, and compliance testing for GEOCHEM ENV.",
  }),
  persona("ENV", {
    departmentName: "HSE",
    jobFunctionCode: "operations",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 95,
    relevanceReason: "HSE/EHS owns compliance monitoring programs that generate ENV laboratory demand.",
  }),
  persona("ENV", {
    departmentName: "Laboratory",
    jobFunctionCode: "laboratory",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 90,
    relevanceReason: "Site or contractor laboratories receive and specify environmental test work.",
  }),
  persona("ENV", {
    departmentName: "QA/QC",
    jobFunctionCode: "quality",
    buyingRole: "TECHNICAL",
    priority: 2,
    relevanceScore: 82,
    relevanceReason: "Quality functions often own sampling integrity and environmental QA data.",
  }),
  persona("ENV", {
    departmentName: "Engineering",
    jobFunctionCode: "operations",
    buyingRole: "USER",
    priority: 2,
    relevanceScore: 78,
    relevanceReason: "Operations/process owners consume ENV results; Engineering hosts operations in the current catalog.",
  }),
  persona("ENV", {
    departmentName: "Procurement",
    jobFunctionCode: "procurement",
    buyingRole: "PROCUREMENT",
    priority: 1,
    relevanceScore: 88,
    relevanceReason: "Vendor selection and PO ownership for contracted environmental laboratory services.",
  }),
  persona("ENV", {
    departmentName: "Procurement",
    jobFunctionCode: "contracts",
    buyingRole: "PROCUREMENT",
    priority: 2,
    relevanceScore: 76,
    relevanceReason: "Frame agreements for environmental testing sit with procurement/contracts counterparts.",
  }),
  persona("ENV", {
    departmentName: "Environment",
    jobFunctionCode: "commercial",
    buyingRole: "GATEKEEPER",
    priority: 3,
    relevanceScore: 70,
    relevanceReason: "Vendor-management gatekeeping for approved environmental laboratories. No Sustainability department in the catalog.",
  }),
];

/** INS Wave-1 personas. Not people. Not contact rows. */
export const INS_CONTACT_PERSONAS: ServiceContactPersona[] = [
  persona("INS", {
    departmentName: "Inspection",
    jobFunctionCode: "inspection",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 100,
    relevanceReason: "Inspection and integrity owners specify third-party NDT, QA/QC, and statutory inspection programs.",
  }),
  persona("INS", {
    departmentName: "Reliability",
    jobFunctionCode: "technical_services",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 95,
    relevanceReason: "Reliability programs drive turnaround, mechanical integrity, and equipment inspection demand.",
  }),
  persona("INS", {
    departmentName: "QA/QC",
    jobFunctionCode: "quality",
    buyingRole: "TECHNICAL",
    priority: 1,
    relevanceScore: 92,
    relevanceReason: "QA/QC owns vendor, construction, and product inspection requirements adjacent to GEOCHEM INS.",
  }),
  persona("INS", {
    departmentName: "Engineering",
    jobFunctionCode: "operations",
    buyingRole: "USER",
    priority: 2,
    relevanceReason: "Operations/engineering consume integrity results; Engineering hosts operations in the current catalog.",
    relevanceScore: 80,
  }),
  persona("INS", {
    departmentName: "Projects",
    jobFunctionCode: "technical_services",
    buyingRole: "TECHNICAL",
    priority: 2,
    relevanceScore: 84,
    relevanceReason: "EPC/project teams specify construction and vendor inspection during industrial projects.",
  }),
  persona("INS", {
    departmentName: "Procurement",
    jobFunctionCode: "procurement",
    buyingRole: "PROCUREMENT",
    priority: 1,
    relevanceScore: 88,
    relevanceReason: "Vendor selection and PO ownership for contracted industrial inspection services.",
  }),
  persona("INS", {
    departmentName: "Procurement",
    jobFunctionCode: "contracts",
    buyingRole: "PROCUREMENT",
    priority: 2,
    relevanceScore: 76,
    relevanceReason: "Frame agreements for inspection sit with procurement/contracts counterparts.",
  }),
  persona("INS", {
    departmentName: "Inspection",
    jobFunctionCode: "commercial",
    buyingRole: "GATEKEEPER",
    priority: 3,
    relevanceScore: 70,
    relevanceReason: "Vendor-management gatekeeping for approved inspection contractors. No Commercial department in the catalog.",
  }),
];

export const SERVICE_CONTACT_PERSONAS: Record<ServiceCode, ServiceContactPersona[]> = {
  PCH: PCH_CONTACT_PERSONAS,
  PET: [],
  MIN: [],
  ENV: ENV_CONTACT_PERSONAS,
  OCM: [],
  MCT: [],
  INS: INS_CONTACT_PERSONAS,
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
  if (pch.some((row) => row.serviceCode !== "PCH")) errors.push("PCH personas must keep serviceCode PCH.");

  const env = SERVICE_CONTACT_PERSONAS.ENV;
  if (env.length !== 8) errors.push("ENV must keep 8 Wave-1 personas.");
  const envKeys = new Set<string>();
  for (const row of env) {
    if (row.serviceCode !== "ENV") errors.push("ENV persona has the wrong serviceCode.");
    if (!depts.has(row.departmentName)) errors.push(`ENV department not in seeded catalog: ${row.departmentName}`);
    if (!codes.has(row.jobFunctionCode)) errors.push(`ENV unknown job function: ${row.jobFunctionCode}`);
    const key = `${row.departmentName}::${row.jobFunctionCode}`;
    if (envKeys.has(key)) errors.push(`ENV duplicate persona ${key}`);
    envKeys.add(key);
  }
  if (!env.some((row) => row.departmentName === "Environment" && row.priority === 1)) {
    errors.push("ENV missing priority-1 Environment persona.");
  }
  if (!env.some((row) => row.departmentName === "HSE" && row.priority === 1)) {
    errors.push("ENV missing priority-1 HSE persona.");
  }
  if (!env.some((row) => row.jobFunctionCode === "laboratory")) errors.push("ENV missing laboratory persona.");
  if (!env.some((row) => row.jobFunctionCode === "procurement" && row.buyingRole === "PROCUREMENT")) {
    errors.push("ENV missing procurement persona.");
  }

  const ins = SERVICE_CONTACT_PERSONAS.INS;
  if (ins.length !== 8) errors.push("INS must keep 8 Wave-1 personas.");
  const insKeys = new Set<string>();
  for (const row of ins) {
    if (row.serviceCode !== "INS") errors.push("INS persona has the wrong serviceCode.");
    if (!depts.has(row.departmentName)) errors.push(`INS department not in seeded catalog: ${row.departmentName}`);
    if (!codes.has(row.jobFunctionCode)) errors.push(`INS unknown job function: ${row.jobFunctionCode}`);
    const key = `${row.departmentName}::${row.jobFunctionCode}`;
    if (insKeys.has(key)) errors.push(`INS duplicate persona ${key}`);
    insKeys.add(key);
  }
  if (!ins.some((row) => row.departmentName === "Inspection" && row.priority === 1)) {
    errors.push("INS missing priority-1 Inspection persona.");
  }
  if (!ins.some((row) => row.departmentName === "Reliability" && row.priority === 1)) {
    errors.push("INS missing priority-1 Reliability persona.");
  }
  if (!ins.some((row) => row.jobFunctionCode === "quality")) errors.push("INS missing QA/QC persona.");
  if (!ins.some((row) => row.jobFunctionCode === "procurement" && row.buyingRole === "PROCUREMENT")) {
    errors.push("INS missing procurement persona.");
  }

  return { ok: errors.length === 0, errors };
}
