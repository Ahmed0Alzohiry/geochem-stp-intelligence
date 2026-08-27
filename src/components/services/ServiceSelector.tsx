import { DEFAULT_SERVICE_CODE, type RegisteredService } from "@/lib/stp/service-registry";

export function ServiceSelector({
  services,
  selectedCode,
  action = "",
  hiddenFields,
}: {
  services: Array<Pick<RegisteredService, "id" | "name" | "service_code" | "readiness"> | { id: string; name: string; service_code: string | null }>;
  selectedCode: string;
  action?: string;
  hiddenFields?: Record<string, string>;
}) {
  const selected = selectedCode || DEFAULT_SERVICE_CODE;
  return (
    <form method="get" action={action} className="flex flex-wrap items-end gap-2">
      {hiddenFields
        ? Object.entries(hiddenFields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))
        : null}
      <label className="text-sm text-steel-600">
        Service
        <select
          name="service"
          defaultValue={selected}
          className="mt-1 block h-10 min-w-64 rounded-md border border-steel-200 bg-white px-3 text-sm text-navy-900"
        >
          {services.map((service) => {
            const code = service.service_code ?? service.id;
            const readiness = "readiness" in service ? service.readiness : null;
            const suffix =
              readiness === "CONFIGURED" ? " · configured" : readiness === "NOT_CONFIGURED" ? " · not configured" : "";
            return (
              <option key={service.id} value={code}>
                {service.service_code ? `${service.service_code} — ${service.name}${suffix}` : service.name}
              </option>
            );
          })}
        </select>
      </label>
      <button type="submit" className="h-10 rounded-md bg-navy-900 px-3 text-sm font-medium text-white">
        Apply
      </button>
    </form>
  );
}
