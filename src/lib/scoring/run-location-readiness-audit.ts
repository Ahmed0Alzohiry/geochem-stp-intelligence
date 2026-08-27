/**
 * STEP 5.18 read-only location/geographic enrichment readiness audit.
 * Does not write to Supabase or overwrite company source fields.
 */
import { createSupabaseBrowserClient } from "../supabase/client";

const PAGE = 1000;

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "0%";
  return `${Math.round((part / whole) * 1000) / 10}%`;
}

function tally(values: (string | null)[]) {
  const map = new Map<string, number>();
  for (const value of values) {
    const key = value ?? "(blank)";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
}

async function fetchPaged(table: string, fields: string, idColumn = "id"): Promise<{ rows: Row[]; error: string | null; count: number }> {
  const supabase = createSupabaseBrowserClient();
  const { count, error: countError } = await supabase.from(table).select(idColumn, { count: "exact", head: true });
  if (countError) return { rows: [], error: countError.message, count: 0 };
  const total = count ?? 0;
  const rows: Row[] = [];
  for (let from = 0; from < total; from += PAGE) {
    const to = Math.min(from + PAGE - 1, total - 1);
    const { data, error } = await supabase.from(table).select(fields).range(from, to);
    if (error) return { rows, error: error.message, count: total };
    rows.push(...(((data ?? []) as unknown) as Row[]));
  }
  return { rows, error: null, count: total };
}

async function probeColumns(table: string, columns: string[]) {
  const supabase = createSupabaseBrowserClient();
  const present: string[] = [];
  const missing: string[] = [];
  for (const column of columns) {
    const { error } = await supabase.from(table).select(column).limit(1);
    if (error) missing.push(column);
    else present.push(column);
  }
  return { present, missing };
}

function namePlace(name: string | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  const places = [
    "yanbu",
    "jeddah",
    "rabigh",
    "makkah",
    "mecca",
    "madinah",
    "medina",
    "jubail",
    "riyadh",
    "dammam",
    "khobar",
    "dhahran",
    "jazan",
    "jizan",
    "tabuk",
    "ras al khair",
    "ras al-khair",
  ];
  return places.find((place) => lower.includes(place)) ?? null;
}

async function main() {
  const companyColumns = await probeColumns("companies", [
    "city",
    "industrial_city",
    "location_city",
    "country",
    "region_id",
    "address",
    "street_address",
    "postal_code",
    "province",
    "state",
    "headquarters_city",
    "hq_city",
    "latitude",
    "longitude",
    "geo_lat",
    "geo_lng",
    "record_type",
    "company_name",
    "parent_company_name",
  ]);

  const select = [
    "id",
    "company_name",
    "record_type",
    "parent_company_name",
    ...companyColumns.present.filter((column) =>
      [
        "city",
        "industrial_city",
        "location_city",
        "country",
        "region_id",
        "address",
        "street_address",
        "postal_code",
        "province",
        "state",
        "headquarters_city",
        "hq_city",
        "latitude",
        "longitude",
      ].includes(column),
    ),
  ].join(", ");

  const companies = await fetchPaged("companies", select);
  const locations = await fetchPaged("company_locations", "id, company_id, city, industrial_city, location_type, region_id");
  const entity = await fetchPaged(
    "company_entity_resolution",
    "company_id, entity_type, account_group_key, entity_resolution_confidence",
    "company_id",
  );
  const regions = await fetchPaged("regions", "id, name, country, industrial_cluster");

  const n = companies.rows.length;
  const cityFilled = companies.rows.filter((row) => Boolean(text(row.city))).length;
  const industrialFilled = companies.rows.filter((row) => Boolean(text(row.industrial_city))).length;
  const locationCityFilled = companies.rows.filter((row) => Boolean(text(row.location_city))).length;
  const countryFilled = companies.rows.filter((row) => Boolean(text(row.country))).length;
  const regionIdFilled = companies.rows.filter((row) => Boolean(row.region_id)).length;
  const usablePlace = companies.rows.filter(
    (row) => Boolean(text(row.city)) || Boolean(text(row.industrial_city)) || Boolean(text(row.location_city)),
  ).length;

  const countryDist = tally(companies.rows.map((row) => text(row.country)));
  const cityDist = tally(companies.rows.map((row) => text(row.city)));
  const industrialDist = tally(companies.rows.map((row) => text(row.industrial_city)));
  const locationCityDist = tally(companies.rows.map((row) => text(row.location_city)));

  const blob = (row: Row) =>
    `${text(row.city) ?? ""} ${text(row.industrial_city) ?? ""} ${text(row.location_city) ?? ""}`.toLowerCase();

  const mentions = (needle: string) => companies.rows.filter((row) => blob(row).includes(needle)).length;
  const nameMentions = (needle: string) =>
    companies.rows.filter((row) => (text(row.company_name) ?? "").toLowerCase().includes(needle)).length;

  const erByCompany = new Map(entity.rows.map((row) => [String(row.company_id), row]));
  const groups = new Map<string, Row[]>();
  for (const row of companies.rows) {
    const er = erByCompany.get(String(row.id));
    const key = text(er?.account_group_key) ?? `solo:${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let multiGroups = 0;
  let groupsWhereFacilityLacksPlaceButParentHas = 0;
  let groupsWhereFacilityHasPlaceParentLacks = 0;
  let groupsAllLackPlace = 0;
  const facilityHasPlaceExamples: string[] = [];
  const wouldBeWrongToCopyHq: string[] = [];

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    multiGroups += 1;
    const typed = members.map((row) => ({
      row,
      type: text(erByCompany.get(String(row.id))?.entity_type),
      place: Boolean(text(row.city) || text(row.industrial_city) || text(row.location_city)),
      name: text(row.company_name),
      city: text(row.city),
    }));
    const accounts = typed.filter((item) => item.type === "ACCOUNT" || item.type === "RELATED");
    const facilities = typed.filter((item) => item.type === "FACILITY" || item.type === "BRANCH");
    const parentHas = accounts.some((item) => item.place);
    const facilityHas = facilities.some((item) => item.place);
    const facilityLacks = facilities.some((item) => !item.place);
    if (parentHas && facilityLacks) {
      groupsWhereFacilityLacksPlaceButParentHas += 1;
      if (wouldBeWrongToCopyHq.length < 8) {
        wouldBeWrongToCopyHq.push(
          `${accounts.map((item) => `${item.name} (${item.city ?? "no city"})`).join(" / ")} → missing site geo on ${facilities
            .filter((item) => !item.place)
            .map((item) => item.name)
            .join(", ")}`,
        );
      }
    }
    if (facilityHas && accounts.some((item) => !item.place)) {
      groupsWhereFacilityHasPlaceParentLacks += 1;
      if (facilityHasPlaceExamples.length < 8) {
        facilityHasPlaceExamples.push(
          facilities
            .filter((item) => item.place)
            .map((item) => `${item.name} @ ${item.city}`)
            .join("; "),
        );
      }
    }
    if (!typed.some((item) => item.place)) groupsAllLackPlace += 1;
  }

  const nameHasPlaceCityBlank = companies.rows.filter((row) => {
    const hasField = Boolean(text(row.city) || text(row.industrial_city) || text(row.location_city));
    return !hasField && Boolean(namePlace(text(row.company_name)));
  }).length;

  const byEntity: Record<string, { n: number; withPlace: number }> = {};
  for (const row of companies.rows) {
    const type = text(erByCompany.get(String(row.id))?.entity_type) ?? "UNLINKED";
    const bucket = byEntity[type] ?? { n: 0, withPlace: 0 };
    bucket.n += 1;
    if (text(row.city) || text(row.industrial_city) || text(row.location_city)) bucket.withPlace += 1;
    byEntity[type] = bucket;
  }

  console.log(
    JSON.stringify(
      {
        totalCompanies: n,
        companyFetchError: companies.error,
        columnsPresent: companyColumns.present,
        columnsMissing: companyColumns.missing,
        usableCity: { count: cityFilled, pct: pct(cityFilled, n) },
        usableIndustrialCity: { count: industrialFilled, pct: pct(industrialFilled, n) },
        usableLocationCity: { count: locationCityFilled, pct: pct(locationCityFilled, n) },
        anyPlaceField: { count: usablePlace, pct: pct(usablePlace, n) },
        usableRegionId: { count: regionIdFilled, pct: pct(regionIdFilled, n) },
        usableCountry: { count: countryFilled, pct: pct(countryFilled, n) },
        countryDist,
        cityDist,
        industrialDist,
        locationCityDist,
        namedPlacesInFields: {
          yanbu: mentions("yanbu"),
          jeddah: mentions("jeddah"),
          rabigh: mentions("rabigh"),
          makkah: mentions("makkah") + mentions("mecca"),
          madinah: mentions("madinah") + mentions("medina"),
          jubail: mentions("jubail"),
          riyadh: mentions("riyadh"),
          dammam: mentions("dammam"),
          khobar: mentions("khobar"),
          dhahran: mentions("dhahran"),
          jazan: mentions("jazan") + mentions("jizan"),
          rasAlKhair: mentions("ras al khair") + mentions("ras al-khair"),
        },
        namedPlacesInCompanyNameOnly: {
          yanbu: nameMentions("yanbu"),
          jeddah: nameMentions("jeddah"),
          rabigh: nameMentions("rabigh"),
          makkah: nameMentions("makkah") + nameMentions("mecca"),
          madinah: nameMentions("madinah") + nameMentions("medina"),
        },
        nameHasPlaceTokenButNoLocationField: nameHasPlaceCityBlank,
        missingAnyPlaceField: n - usablePlace,
        companyLocations: {
          error: locations.error,
          count: locations.count,
        },
        regionsMaster: {
          error: regions.error,
          count: regions.count,
          names: regions.rows.map((row) => text(row.name)),
        },
        entityResolution: {
          error: entity.error,
          count: entity.count,
          byEntity,
          multiRecordGroups: multiGroups,
          groupsWhereFacilityLacksPlaceButParentHas,
          groupsWhereFacilityHasPlaceParentLacks,
          groupsAllLackPlace,
          wouldBeWrongToCopyHq,
          facilityHasPlaceExamples,
        },
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
