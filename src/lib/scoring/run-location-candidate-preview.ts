/**
 * STEP 5.19 read-only candidate preview for verified facility locations.
 * Does not write company_locations or overwrite companies.
 */
import { createSupabaseBrowserClient } from "../supabase/client";
import {
  assessNamedFacility,
  detectWesternCity,
  isFacilityOrBranch,
  type NamedFacilityScan,
  type RejectedNamedFacility,
  type VerifiedLocationCandidate,
} from "../locations/western-facility-location";

const PAGE = 1000;

type CompanyRow = {
  id: string;
  company_name: string | null;
  website: string | null;
  website_domain: string | null;
  city: string | null;
  industrial_city: string | null;
  parent_company_name: string | null;
};

type EntityRow = {
  company_id: string;
  entity_type: string;
  account_group_key: string;
};

function text(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function fetchAll<T>(table: string, fields: string, idCol: string): Promise<T[]> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from(table).select(idCol, { count: "exact", head: true });
  if (countError) throw new Error(`${table}: ${countError.message}`);
  const total = count ?? 0;
  const rows: T[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from(table).select(fields).range(from, to);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(((data ?? []) as unknown) as T[]));
  }
  return rows;
}

function previewRow(row: VerifiedLocationCandidate) {
  return {
    company_id: row.company_id,
    company_name: row.company_name,
    entity_type: row.entity_type,
    detected_city: row.detected_city,
    proposed_region: row.proposed_region,
    evidence: row.evidence,
    source_url: row.source_url,
    confidence: row.confidence,
  };
}

async function main() {
  const companies = await fetchAll<CompanyRow>(
    "companies",
    "id, company_name, website, website_domain, city, industrial_city, parent_company_name",
    "id",
  );
  const entities = await fetchAll<EntityRow>(
    "company_entity_resolution",
    "company_id, entity_type, account_group_key",
    "company_id",
  );
  const er = new Map(entities.map((row) => [row.company_id, row]));
  const byGroup = new Map<string, string[]>();
  for (const row of entities) {
    byGroup.set(row.account_group_key, [...(byGroup.get(row.account_group_key) ?? []), row.company_id]);
  }

  const scanned = companies.filter((row) => isFacilityOrBranch(er.get(row.id)?.entity_type));
  const named: NamedFacilityScan[] = [];
  for (const row of scanned) {
    const name = text(row.company_name);
    if (!name) continue;
    const city = detectWesternCity(name);
    if (!city) continue;
    const meta = er.get(row.id);
    named.push({
      company_id: row.id,
      company_name: name,
      entity_type: meta?.entity_type ?? "UNKNOWN",
      detected_city: city,
      proposed_region: "Western Region",
      stored_city: text(row.city),
      stored_industrial_city: text(row.industrial_city),
      parent_company_name: text(row.parent_company_name),
      website: text(row.website),
      website_domain: text(row.website_domain),
      account_group_key: meta?.account_group_key ?? "",
      group_size: byGroup.get(meta?.account_group_key ?? "")?.length ?? 1,
    });
  }

  const assessed = named.map(assessNamedFacility);
  const verified = assessed.filter((row): row is VerifiedLocationCandidate => "confidence" in row);
  const rejectedNamed = assessed.filter((row): row is RejectedNamedFacility => "reject_reason" in row);
  const multiGroups = new Map<string, VerifiedLocationCandidate[]>();
  for (const row of verified) {
    multiGroups.set(row.account_group_key, [...(multiGroups.get(row.account_group_key) ?? []), row]);
  }

  console.log(
    JSON.stringify(
      {
        persisted: false,
        companiesUpdated: 0,
        facilityBranchScanned: scanned.length,
        namedPlaceInOwnName: named.length,
        namedByCity: {
          Yanbu: named.filter((row) => row.detected_city === "Yanbu").length,
          Jeddah: named.filter((row) => row.detected_city === "Jeddah").length,
          Rabigh: named.filter((row) => row.detected_city === "Rabigh").length,
        },
        rejectedNoPlaceInName: scanned.length - named.length,
        rejectedInsufficientEvidence: rejectedNamed.length,
        verifiedCandidates: verified.length,
        confidence: {
          HIGH: verified.filter((row) => row.confidence === "HIGH").length,
          MEDIUM: verified.filter((row) => row.confidence === "MEDIUM").length,
          LOW: verified.filter((row) => row.confidence === "LOW").length,
        },
        verifiedByCity: {
          Yanbu: verified.filter((row) => row.detected_city === "Yanbu").length,
          Jeddah: verified.filter((row) => row.detected_city === "Jeddah").length,
          Rabigh: verified.filter((row) => row.detected_city === "Rabigh").length,
        },
        accountGroupsWithMultipleVerifiedSites: [...multiGroups.values()]
          .filter((rows) => rows.length > 1)
          .map((rows) => ({
            account_group_key: rows[0]?.account_group_key,
            group_size: rows[0]?.group_size,
            sites: rows.map((row) => `${row.company_name} → ${row.detected_city}`),
          })),
        preview: verified.map(previewRow).sort((a, b) => a.company_name.localeCompare(b.company_name)),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
