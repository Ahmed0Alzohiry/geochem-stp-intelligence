const CSV_HEADERS = [
  "batch_id",
  "source_row",
  "company_name",
  "legal_name",
  "name_ar",
  "alias_name",
  "website",
  "website_domain",
  "commercial_registration_number",
  "industry",
  "subsector",
  "customer_type",
  "region",
  "city",
  "industrial_city",
  "parent_company_name",
  "business_description",
  "main_activities",
  "location_type",
  "location_city",
  "source_url",
  "source_type",
  "source_reliability",
  "source_tier",
  "verification_status",
  "last_verified_at",
  "data_completeness_status",
  "is_demo",
  "researcher_notes",
] as const;

export function parseCsv(text: string): { headers: string[]; records: Record<string, string>[] } {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    throw new Error("CSV is empty.");
  }

  const headers = rows[0].map((header) => header.trim());
  const missing = CSV_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new Error(`CSV is missing required headers: ${missing.join(", ")}`);
  }

  const records = rows.slice(1).flatMap((cells, index) => {
    if (cells.every((cell) => cell.trim() === "")) {
      return [];
    }
    const record: Record<string, string> = { _csv_line: String(index + 2) };
    headers.forEach((header, i) => {
      record[header] = cells[i] ?? "";
    });
    return [record];
  });

  return { headers, records };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV has an unclosed quoted field.");
  }

  row.push(field);
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }

  return rows;
}
