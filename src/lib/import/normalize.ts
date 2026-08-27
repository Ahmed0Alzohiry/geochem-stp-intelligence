/** Matches public.normalize_company_name: lower, trim, drop non-letters/digits. */
export function normalizeCompanyName(input: string | null | undefined): string | null {
  if (input == null) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return normalized || null;
}

export function normalizeWebsiteDomain(
  website: string | null | undefined,
  websiteDomain: string | null | undefined,
): string | null {
  const explicit = websiteDomain?.trim();
  const fromSite = website?.trim();
  const raw = explicit || fromSite;
  if (!raw) {
    return null;
  }

  let host = raw.toLowerCase().trim();
  host = host.replace(/^https?:\/\//, "");
  host = host.replace(/^www\./, "");
  host = host.split("/")[0]?.split("?")[0]?.split("#")[0] ?? host;
  host = host.replace(/:\d+$/, "");
  host = host.replace(/\.$/, "");
  return host || null;
}

export function normalizeCommercialRegistration(
  input: string | null | undefined,
): string | null {
  if (input == null) {
    return null;
  }
  const digits = input.replace(/[^\d]/g, "");
  return digits || null;
}

export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
