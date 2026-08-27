/**
 * STEP 5.16 read-only company data-quality and entity-resolution audit.
 * Does not write to Supabase, merge, delete, or persist scores.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import { normalizeCompanyName } from "../import/normalize";

const PAGE = 1000;
const TOTAL_EXPECTED = 1769;

const FIELDS = [
  "company_name",
  "legal_name",
  "industry",
  "subsector",
  "customer_type",
  "city",
  "industrial_city",
  "location_city",
  "website",
  "website_domain",
  "commercial_registration_number",
  "parent_company_name",
  "business_description",
  "main_activities",
  "source_url",
  "source_type",
  "source_reliability",
  "verification_status",
  "last_verified_at",
  "data_completeness_status",
] as const;

const SELECT_CORE =
  "id, company_name, legal_name, industry, subsector, customer_type, city, industrial_city, location_city, website, website_domain, commercial_registration_number, parent_company_name, parent_company_id, is_subsidiary, business_description, main_activities, source_url, source_type, source_reliability, verification_status, last_verified_at, data_completeness_status, record_type, country, dataset_status";

const SELECT_MID =
  "id, company_name, legal_name, industry, subsector, customer_type, city, industrial_city, website, website_domain, commercial_registration_number, parent_company_name, parent_company_id, business_description, main_activities, source_reliability, verification_status, last_verified_at, data_completeness_status, record_type, country, dataset_status";

const SELECT_WITH_OPTIONAL =
  "id, company_name, legal_name, industry, subsector, customer_type, city, industrial_city, location_city, website, website_domain, commercial_registration_number, parent_company_name, business_description, main_activities, source_url, source_type, source_reliability, verification_status, last_verified_at, data_completeness_status, record_type, dataset_status";

const SELECT_MIN =
  "id, company_name, legal_name, industry, subsector, customer_type, city, industrial_city, website, website_domain, commercial_registration_number, parent_company_name, business_description, main_activities, source_reliability, verification_status, last_verified_at, data_completeness_status, record_type, dataset_status";

type Row = Record<string, unknown>;

function filled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function str(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const IMPORTANCE: Record<(typeof FIELDS)[number], "Critical" | "High" | "Medium" | "Low"> = {
  company_name: "Critical",
  legal_name: "High",
  industry: "Critical",
  subsector: "Critical",
  customer_type: "High",
  city: "Critical",
  industrial_city: "High",
  location_city: "High",
  website: "Medium",
  website_domain: "High",
  commercial_registration_number: "High",
  parent_company_name: "High",
  business_description: "High",
  main_activities: "High",
  source_url: "Medium",
  source_type: "Medium",
  source_reliability: "Medium",
  verification_status: "Medium",
  last_verified_at: "Low",
  data_completeness_status: "Low",
};

const SITE_NAME =
  /\b(operations|operating site|facility|plant|terminal|refinery operations|industrial operations|complex|site)\b/i;
const BRANCH_NAME = /\b(branch|office|regional office|head office|hq)\b/i;
const WESTERN_CITY = /\b(yanbu|jeddah|rabigh|jazan|thuwal|kaec|king abdullah economic)\b/i;
const EASTERN_CITY = /\b(jubail|dammam|khobar|ras al khair|dhahran|ras tanura|king abdulaziz port)\b/i;

const STEM_SUFFIXES = [
  "industrialoperations",
  "refineryoperations",
  "refiningoperations",
  "baseoiloperations",
  "polymeroperations",
  "industrialcity",
  "operations",
  "facility",
  "plant",
  "terminal",
  "yanbu",
  "jeddah",
  "rabigh",
  "jubail",
  "dammam",
  "riyadh",
];

function accountStem(name: string | null): string | null {
  const normalized = normalizeCompanyName(name);
  if (!normalized) return null;
  let stem = normalized;
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of STEM_SUFFIXES) {
      if (stem.length - suffix.length >= 10 && stem.endsWith(suffix)) {
        stem = stem.slice(0, -suffix.length);
        changed = true;
      }
    }
  }
  return stem.length >= 10 ? stem : normalized;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((prev[j] ?? 0) + 1, (curr[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = curr[j] ?? 0;
  }
  return prev[n] ?? 0;
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshtein(a, b) / maxLen;
}

function locationBlob(row: Row): string | null {
  const parts = [str(row.city), str(row.industrial_city), str(row.location_city)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" / ") : null;
}

function classifyReadiness(row: Row): "READY" | "PARTIAL" | "INSUFFICIENT" {
  if (!filled(row.company_name) || !filled(row.industry)) return "INSUFFICIENT";
  const hasPlace = filled(row.city) || filled(row.industrial_city) || filled(row.location_city);
  if (filled(row.subsector) && filled(row.customer_type) && hasPlace) return "READY";
  return "PARTIAL";
}

function classifyEntity(row: Row): "ACCOUNT" | "FACILITY" | "BRANCH" | "UNKNOWN" {
  const name = str(row.company_name) ?? "";
  const recordType = str(row.record_type);
  if (BRANCH_NAME.test(name) && !SITE_NAME.test(name)) return "BRANCH";
  if (recordType === "Facility/Operations" || SITE_NAME.test(name) || filled(row.parent_company_id)) {
    if (recordType === "Company" && !SITE_NAME.test(name) && !filled(row.parent_company_id)) {
      return "ACCOUNT";
    }
    if (recordType === "Facility/Operations" || SITE_NAME.test(name) || filled(row.parent_company_name)) {
      return "FACILITY";
    }
  }
  if (recordType === "Company") return "ACCOUNT";
  if (recordType === "Facility/Operations") return "FACILITY";
  return "UNKNOWN";
}

async function fetchAll(select: string): Promise<Row[]> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from("companies").select("id", { count: "exact", head: true });
  if (countError) throw new Error(countError.message);
  const total = count ?? 0;
  const rows: Row[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from("companies").select(select).range(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(((data ?? []) as unknown) as Row[]));
  }
  return rows;
}

async function countTable(table: string): Promise<{ count: number | null; error: string | null }> {
  const supabase = createSupabaseBrowserClient();
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  return { count: count ?? null, error: error?.message ?? null };
}

async function main() {
  const attempts = [SELECT_CORE, SELECT_WITH_OPTIONAL, SELECT_MID, SELECT_MIN];
  let lastError = "";
  let rows: Row[] = [];
  for (const select of attempts) {
    try {
      rows = await fetchAll(select);
      lastError = "";
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (rows.length === 0) throw new Error(lastError || "Unable to load companies");

  const supabase = createSupabaseBrowserClient();
  const missingColumns: string[] = [];
  for (const field of [...FIELDS, "parent_company_id", "record_type", "country", "alias_name"]) {
    const { error } = await supabase.from("companies").select(field).limit(1);
    if (error) missingColumns.push(field);
  }

  const n = rows.length;
  const completeness = FIELDS.map((field) => {
    const existsOnRows = rows.some((row) => field in row);
    if (!existsOnRows) {
      return {
        field,
        populated: 0,
        missing: n,
        completenessPct: 0,
        importance: IMPORTANCE[field],
        note: "Column not present on public.companies in this select",
      };
    }
    const populated = rows.filter((row) => filled(row[field])).length;
    return {
      field,
      populated,
      missing: n - populated,
      completenessPct: Math.round((populated / n) * 1000) / 10,
      importance: IMPORTANCE[field],
      note: null,
    };
  });

  const readiness = { READY: 0, PARTIAL: 0, INSUFFICIENT: 0 };
  const entity = { ACCOUNT: 0, FACILITY: 0, BRANCH: 0, UNKNOWN: 0 };
  for (const row of rows) {
    readiness[classifyReadiness(row)] += 1;
    entity[classifyEntity(row)] += 1;
  }

  const nameGroups = new Map<string, Row[]>();
  const domainGroups = new Map<string, Row[]>();
  const crGroups = new Map<string, Row[]>();
  const parentNameGroups = new Map<string, Row[]>();
  const stemGroups = new Map<string, Row[]>();

  for (const row of rows) {
    const norm =
      str(row.normalized_name) ??
      normalizeCompanyName(str(row.company_name)) ??
      "∅";
    nameGroups.set(norm, [...(nameGroups.get(norm) ?? []), row]);
    const domain = str(row.website_domain)?.toLowerCase();
    if (domain) domainGroups.set(domain, [...(domainGroups.get(domain) ?? []), row]);
    const cr = str(row.commercial_registration_number)?.replace(/\D/g, "");
    if (cr) crGroups.set(cr, [...(crGroups.get(cr) ?? []), row]);
    const parent = normalizeCompanyName(str(row.parent_company_name));
    if (parent) parentNameGroups.set(parent, [...(parentNameGroups.get(parent) ?? []), row]);
    const stem = accountStem(str(row.company_name));
    if (stem) stemGroups.set(stem, [...(stemGroups.get(stem) ?? []), row]);
  }

  function extraPairs(groups: Map<string, Row[]>): { groups: number; extraRows: number; examples: string[] } {
    let groupsN = 0;
    let extra = 0;
    const examples: string[] = [];
    for (const [key, members] of groups) {
      if (key === "∅" || members.length < 2) continue;
      groupsN += 1;
      extra += members.length - 1;
      if (examples.length < 8) {
        examples.push(`${key} → ${members.map((m) => str(m.company_name)).join(" | ")}`);
      }
    }
    return { groups: groupsN, extraRows: extra, examples };
  }

  const exactName = extraPairs(nameGroups);
  const exactDomain = extraPairs(domainGroups);
  const exactCr = extraPairs(crGroups);
  const parentClusters = extraPairs(parentNameGroups);
  const stemClusters = extraPairs(
    new Map([...stemGroups.entries()].filter(([, members]) => members.length >= 2)),
  );

  const similarPairs: { a: string; b: string; score: number }[] = [];
  const byPrefix = new Map<string, Row[]>();
  for (const row of rows) {
    const norm = normalizeCompanyName(str(row.company_name));
    if (!norm || norm.length < 8) continue;
    const prefix = norm.slice(0, 8);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), row]);
  }
  for (const members of byPrefix.values()) {
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = normalizeCompanyName(str(members[i]?.company_name));
        const b = normalizeCompanyName(str(members[j]?.company_name));
        if (!a || !b || a === b) continue;
        const score = similarity(a, b);
        if (score >= 0.88 && similarPairs.length < 500) {
          similarPairs.push({
            a: str(members[i]?.company_name) ?? "",
            b: str(members[j]?.company_name) ?? "",
            score: Math.round(score * 100) / 100,
          });
        }
      }
    }
  }

  const parentFilled = rows.filter((row) => filled(row.parent_company_name)).length;
  const parentIdFilled = rows.filter((row) => filled(row.parent_company_id)).length;
  const recordTypeCounts: Record<string, number> = {};
  for (const row of rows) {
    const key = str(row.record_type) ?? "(null)";
    recordTypeCounts[key] = (recordTypeCounts[key] ?? 0) + 1;
  }

  const hasAnyGeo = rows.filter((row) => Boolean(locationBlob(row))).length;
  const geo = {
    anyLocation: hasAnyGeo,
    city: rows.filter((row) => filled(row.city)).length,
    industrialCity: rows.filter((row) => filled(row.industrial_city)).length,
    locationCity: rows.filter((row) => filled(row.location_city)).length,
    yanbu: 0,
    jeddah: 0,
    rabigh: 0,
    jubail: 0,
    riyadh: 0,
    dammam: 0,
    khobar: 0,
    dammamEasternCities: 0,
    eastern: 0,
    western: 0,
    unspecified: 0,
  };
  for (const row of rows) {
    const loc = (locationBlob(row) ?? "").toLowerCase();
    if (!loc) {
      geo.unspecified += 1;
      continue;
    }
    if (loc.includes("yanbu")) geo.yanbu += 1;
    if (loc.includes("jeddah")) geo.jeddah += 1;
    if (loc.includes("rabigh")) geo.rabigh += 1;
    if (loc.includes("jubail")) geo.jubail += 1;
    if (loc.includes("riyadh")) geo.riyadh += 1;
    if (loc.includes("dammam")) geo.dammam += 1;
    if (loc.includes("khobar")) geo.khobar += 1;
    if (loc.includes("dammam") || loc.includes("khobar") || loc.includes("dhahran") || loc.includes("ras al khair")) {
      geo.dammamEasternCities += 1;
    }
    if (EASTERN_CITY.test(loc)) geo.eastern += 1;
    if (WESTERN_CITY.test(loc) || loc.includes("jabal sayid")) geo.western += 1;
  }

  const scoringCoverage = {
    industry: completeness.find((c) => c.field === "industry"),
    subsector: completeness.find((c) => c.field === "subsector"),
    city: completeness.find((c) => c.field === "city"),
    industrial_city: completeness.find((c) => c.field === "industrial_city"),
    customer_type: completeness.find((c) => c.field === "customer_type"),
    verification: completeness.find((c) => c.field === "verification_status"),
  };

  const [locations, aliases, sources] = await Promise.all([
    countTable("company_locations"),
    countTable("company_aliases"),
    countTable("company_sources"),
  ]);

  const pct = (count: number) => `${count} (${Math.round((count / n) * 1000) / 10}%)`;

  const report = {
    liveCompaniesChecked: n,
    expected: TOTAL_EXPECTED,
    missingColumns,
    completeness,
    readiness: {
      READY: pct(readiness.READY),
      PARTIAL: pct(readiness.PARTIAL),
      INSUFFICIENT: pct(readiness.INSUFFICIENT),
      counts: readiness,
    },
    entityModel: {
      ACCOUNT: pct(entity.ACCOUNT),
      FACILITY: pct(entity.FACILITY),
      BRANCH: pct(entity.BRANCH),
      UNKNOWN: pct(entity.UNKNOWN),
      counts: entity,
      recordTypeCounts,
      parent_company_name_filled: parentFilled,
      parent_company_id_filled: parentIdFilled,
    },
    duplicates: {
      exactNormalizedName: exactName,
      exactWebsiteDomain: exactDomain,
      exactCr: exactCr,
      parentCompanyNameClusters: parentClusters,
      facilityStemClusters: stemClusters,
      similarNamePairsSample: similarPairs.slice(0, 15),
      similarNamePairCount: similarPairs.length,
      relationCounts: {
        EXACT_DUPLICATE_extra_rows: exactName.extraRows + exactDomain.extraRows + exactCr.extraRows,
        EXACT_DUPLICATE_name_groups: exactName.groups,
        EXACT_DUPLICATE_domain_groups: exactDomain.groups,
        EXACT_DUPLICATE_cr_groups: exactCr.groups,
        LIKELY_DUPLICATE_similar_name_pairs: similarPairs.length,
        PARENT_COMPANY_named_clusters: parentClusters.groups,
        FACILITY_stem_clusters: stemClusters.groups,
        BRANCH_records: entity.BRANCH,
        RELATED_BUT_DISTINCT_parent_named_rows: parentFilled,
        REVIEW_REQUIRED: similarPairs.length + stemClusters.groups,
      },
    },
    geo,
    relatedTables: { company_locations: locations, company_aliases: aliases, company_sources: sources },
    scoringCoverage,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
