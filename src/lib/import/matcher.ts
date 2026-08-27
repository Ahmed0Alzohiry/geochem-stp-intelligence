import { normalizeCompanyName } from "./normalize";
import type {
  DryRunClass,
  DryRunMatch,
  MatchUniverse,
  MatchUniverseCompany,
  StagingDedupStatus,
  StagingImportDecision,
  ValidatedImportRow,
} from "./types";

const SITE_LOCATION_TYPES = new Set(["Operating site", "Industrial city", "Project site"]);

type Hit = {
  company: MatchUniverseCompany;
  via: StagingDedupStatus;
};

function mapClass(classification: DryRunClass): {
  importDecision: StagingImportDecision;
  dedupStatus: StagingDedupStatus;
} {
  switch (classification) {
    case "NEW":
      return { importDecision: "NEW_COMPANY", dedupStatus: "UNMATCHED" };
    case "DUPLICATE":
      return { importDecision: "UPDATE_EXISTING", dedupStatus: "CR_MATCH" };
    case "POSSIBLE_MATCH":
      return { importDecision: "MANUAL_REVIEW", dedupStatus: "NAME_MATCH" };
    case "FACILITY_OF_EXISTING":
      return { importDecision: "FACILITY_OF_EXISTING", dedupStatus: "FACILITY_MATCH" };
    case "NEEDS_REVIEW":
      return { importDecision: "MANUAL_REVIEW", dedupStatus: "AMBIGUOUS" };
    case "INVALID":
      return { importDecision: "REJECT", dedupStatus: "UNMATCHED" };
  }
}

function uniqueCompanies(hits: Hit[]): MatchUniverseCompany[] {
  const seen = new Map<string, MatchUniverseCompany>();
  for (const hit of hits) {
    seen.set(hit.company.id, hit.company);
  }
  return [...seen.values()];
}

function findByCr(universe: MatchUniverse, cr: string | null): Hit[] {
  if (!cr) {
    return [];
  }
  return universe.companies
    .filter((company) => company.commercialRegistrationNumber === cr)
    .map((company) => ({ company, via: "CR_MATCH" as const }));
}

function findByDomain(universe: MatchUniverse, domain: string | null): Hit[] {
  if (!domain) {
    return [];
  }
  return universe.companies
    .filter((company) => company.websiteDomain === domain)
    .map((company) => ({ company, via: "DOMAIN_MATCH" as const }));
}

function nameKeys(row: ValidatedImportRow): string[] {
  return [row.normalizedLegalName, row.normalizedName].filter((value): value is string => Boolean(value));
}

function findByNormalizedName(universe: MatchUniverse, row: ValidatedImportRow): Hit[] {
  const keys = new Set(nameKeys(row));
  return universe.companies
    .filter((company) => {
      const companyKeys = [
        company.normalizedName,
        normalizeCompanyName(company.legalName),
        normalizeCompanyName(company.companyName),
      ].filter((value): value is string => Boolean(value));
      return companyKeys.some((key) => keys.has(key));
    })
    .map((company) => ({ company, via: "NAME_MATCH" as const }));
}

function findByAlias(universe: MatchUniverse, row: ValidatedImportRow): Hit[] {
  const keys = new Set(
    [row.normalizedAlias, row.normalizedName, row.normalizedLegalName].filter(
      (value): value is string => Boolean(value),
    ),
  );
  const companyIds = new Set(
    universe.aliases.filter((alias) => keys.has(alias.normalizedAlias)).map((alias) => alias.companyId),
  );
  return universe.companies
    .filter((company) => companyIds.has(company.id))
    .map((company) => ({ company, via: "ALIAS_MATCH" as const }));
}

function looksLikeFacility(row: ValidatedImportRow): boolean {
  return Boolean(
    row.parentCompanyName && row.locationType && SITE_LOCATION_TYPES.has(row.locationType),
  );
}

function findParent(universe: MatchUniverse, row: ValidatedImportRow): MatchUniverseCompany[] {
  if (!row.normalizedParentName) {
    return [];
  }
  return universe.companies.filter((company) => {
    const keys = [
      company.normalizedName,
      normalizeCompanyName(company.legalName),
      normalizeCompanyName(company.companyName),
    ].filter((value): value is string => Boolean(value));
    return keys.includes(row.normalizedParentName as string);
  });
}

function findFacilitySite(universe: MatchUniverse, row: ValidatedImportRow): Hit[] {
  const siteCity = (row.locationCity ?? row.city).trim().toLowerCase();
  const siteIndustrial = row.industrialCity?.trim().toLowerCase() ?? null;
  const parentHits = findParent(universe, row);

  const byLocation = universe.locations.filter((location) => {
    const cityMatch = location.city.trim().toLowerCase() === siteCity;
    const industrialMatch =
      !siteIndustrial ||
      (location.industrialCity ?? "").trim().toLowerCase() === siteIndustrial;
    return cityMatch && industrialMatch;
  });

  if (parentHits.length === 1) {
    return parentHits.map((company) => ({ company, via: "FACILITY_MATCH" as const }));
  }

  const locationCompanies = universe.companies.filter((company) =>
    byLocation.some((location) => location.companyId === company.id),
  );
  if (parentHits.length === 0 && locationCompanies.length === 1 && looksLikeFacility(row)) {
    return locationCompanies.map((company) => ({ company, via: "FACILITY_MATCH" as const }));
  }

  if (parentHits.length > 1) {
    return parentHits.map((company) => ({ company, via: "FACILITY_MATCH" as const }));
  }

  return [];
}

function conflict(a: Hit[], b: Hit[]): boolean {
  if (a.length === 0 || b.length === 0) {
    return false;
  }
  const idsA = new Set(a.map((hit) => hit.company.id));
  return b.some((hit) => !idsA.has(hit.company.id));
}

export function classifyRow(row: ValidatedImportRow, universe: MatchUniverse): DryRunMatch {
  const crHits = findByCr(universe, row.commercialRegistrationNumber);
  const domainHits = findByDomain(universe, row.websiteDomain);
  const nameHits = findByNormalizedName(universe, row);
  const aliasHits = findByAlias(universe, row);
  const facilityHits = looksLikeFacility(row) ? findFacilitySite(universe, row) : [];

  if (
    conflict(crHits, domainHits) ||
    conflict(crHits, nameHits) ||
    conflict(domainHits, nameHits) ||
    (crHits.length > 1 || domainHits.length > 1)
  ) {
    return finish(row, "NEEDS_REVIEW", null, "Conflicting or multiple identity matches");
  }

  if (crHits.length === 1) {
    return finish(
      row,
      "DUPLICATE",
      crHits[0].company,
      "Exact commercial_registration_number match",
      "CR_MATCH",
    );
  }

  if (domainHits.length === 1) {
    return finish(
      row,
      "DUPLICATE",
      domainHits[0].company,
      "Exact website_domain match",
      "DOMAIN_MATCH",
    );
  }

  if (looksLikeFacility(row)) {
    const parents = uniqueCompanies(facilityHits);
    if (parents.length === 1) {
      return finish(
        row,
        "FACILITY_OF_EXISTING",
        parents[0],
        "Site/facility of an existing or earlier-batch parent",
        "FACILITY_MATCH",
      );
    }
    if (row.parentCompanyName && parents.length === 0) {
      return finish(
        row,
        "NEEDS_REVIEW",
        null,
        "Facility row names a parent that is not in production or this batch",
      );
    }
    if (parents.length > 1) {
      return finish(row, "NEEDS_REVIEW", null, "Facility row matches more than one parent");
    }
  }

  if (nameHits.length === 1) {
    return finish(
      row,
      "POSSIBLE_MATCH",
      nameHits[0].company,
      "Normalized legal/company name match without CR or domain confirmation",
      "NAME_MATCH",
    );
  }

  if (aliasHits.length === 1) {
    return finish(
      row,
      "POSSIBLE_MATCH",
      aliasHits[0].company,
      "Alias match without CR or domain confirmation",
      "ALIAS_MATCH",
    );
  }

  if (nameHits.length > 1 || aliasHits.length > 1) {
    return finish(row, "NEEDS_REVIEW", null, "Multiple name or alias matches");
  }

  return finish(row, "NEW", null, "No CR, domain, name, alias, or facility match");
}

function finish(
  row: ValidatedImportRow,
  classification: DryRunClass,
  matched: MatchUniverseCompany | null,
  reason: string,
  dedupOverride?: StagingDedupStatus,
): DryRunMatch {
  const mapped = mapClass(classification);
  const productionId =
    matched?.origin === "production" && isUuid(matched.id) ? matched.id : null;
  return {
    row,
    classification,
    importDecision: mapped.importDecision,
    dedupStatus: dedupOverride ?? mapped.dedupStatus,
    matchedCompanyId: productionId,
    matchedBatchRow: matched?.origin === "batch" ? (matched.sourceRow ?? null) : null,
    reason,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function matchBatch(accepted: ValidatedImportRow[], production: MatchUniverse): DryRunMatch[] {
  const results: DryRunMatch[] = [];
  const growing: MatchUniverse = {
    companies: [...production.companies],
    aliases: [...production.aliases],
    locations: [...production.locations],
  };

  const sorted = [...accepted].sort((a, b) => a.sourceRow - b.sourceRow);
  for (const row of sorted) {
    const match = classifyRow(row, growing);
    results.push(match);
    if (match.classification === "NEW") {
      const id = `batch:${row.batchId}:${row.sourceRow}`;
      growing.companies.push({
        id,
        origin: "batch",
        batchId: row.batchId,
        sourceRow: row.sourceRow,
        companyName: row.companyName,
        legalName: row.legalName,
        normalizedName: row.normalizedLegalName ?? row.normalizedName,
        websiteDomain: row.websiteDomain,
        commercialRegistrationNumber: row.commercialRegistrationNumber,
        parentCompanyName: row.parentCompanyName,
        city: row.city,
      });
      if (row.normalizedAlias) {
        growing.aliases.push({ companyId: id, normalizedAlias: row.normalizedAlias });
      }
      growing.locations.push({
        companyId: id,
        city: row.locationCity ?? row.city,
        industrialCity: row.industrialCity,
        locationType: row.locationType ?? "Headquarters",
      });
    }
  }

  return results.sort((a, b) => a.row.sourceRow - b.row.sourceRow);
}

export function emptyUniverse(): MatchUniverse {
  return { companies: [], aliases: [], locations: [] };
}
