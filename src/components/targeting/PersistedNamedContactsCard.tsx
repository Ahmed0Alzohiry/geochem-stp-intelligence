import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { PersistedContactDisplay } from "@/lib/supabase/persisted-contacts";

function dash(value: string | number | null | undefined): string {
  if (value == null || value === "") return "—";
  return String(value);
}

export function PersistedNamedContactsCard({
  serviceCode,
  contacts,
}: {
  serviceCode: string;
  contacts: PersistedContactDisplay[];
}) {
  return (
    <Card>
      <CardHeader
        title="Persisted contacts"
        description={`Named people stored for this ${serviceCode} account. Inherited parent contacts are shown, not cloned.`}
      />
      <CardBody className="space-y-4">
        {contacts.length === 0 ? (
          <p className="text-sm text-steel-500">No persisted named contacts for this account yet.</p>
        ) : (
          contacts.map((contact) => (
            <article key={contact.id} className="rounded-md border border-steel-100 p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-base font-semibold text-navy-900">{contact.fullName}</p>
                  <p className="text-steel-700">
                    {dash(contact.jobTitle)}
                    {contact.contactRole ? ` · ${contact.contactRole}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {contact.verificationStatus ? (
                    <Badge variant={contact.verificationStatus === "Verified" ? "success" : "default"}>
                      {contact.verificationStatus}
                    </Badge>
                  ) : null}
                  {contact.displayMode === "INHERITED_FROM_ACCOUNT" ? (
                    <Badge variant="teal">Inherited from account</Badge>
                  ) : (
                    <Badge variant="navy">Owned</Badge>
                  )}
                </div>
              </div>

              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-steel-500">Department / job function</dt>
                  <dd>
                    {dash(contact.departmentName)}
                    {contact.jobFunctionName ? ` / ${contact.jobFunctionName}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-steel-500">Company / account</dt>
                  <dd>
                    {contact.owningCompanyName}
                    {contact.displayMode === "INHERITED_FROM_ACCOUNT" ? " (parent ACCOUNT)" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-steel-500">{contact.serviceCode} relevance</dt>
                  <dd>
                    {dash(contact.buyingRole)}
                    {contact.relevanceScore != null ? ` · ${contact.relevanceScore}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-steel-500">Evidence / source</dt>
                  <dd>
                    {dash(contact.evidenceType)}
                    {contact.sourceConfidence ? ` · ${contact.sourceConfidence}` : ""}
                    {contact.sourceName ? ` · ${contact.sourceName}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-steel-500">Verified at</dt>
                  <dd>{dash(contact.verifiedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-steel-500">Source URL</dt>
                  <dd className="break-all">
                    {contact.sourceUrl ? (
                      <a className="text-teal-700 hover:underline" href={contact.sourceUrl} target="_blank" rel="noreferrer">
                        {contact.sourceUrl}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              {contact.relevanceReason ? (
                <p className="mt-2 text-xs text-steel-500">{contact.relevanceReason}</p>
              ) : null}
            </article>
          ))
        )}
      </CardBody>
    </Card>
  );
}
