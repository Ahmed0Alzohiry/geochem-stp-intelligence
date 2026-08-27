import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/FormControls";
import { TierBadge } from "@/components/ui/Badge";
import { Table, THead, Th, Td } from "@/components/ui/Table";
import { ServicePersonaTargets } from "@/components/targeting/ServicePersonaTargets";
import { ContactCollectionRulesCard } from "@/components/targeting/ContactCollectionRulesCard";
import { PersistedNamedContactsCard } from "@/components/targeting/PersistedNamedContactsCard";
import { CompanyOpportunitiesCard } from "@/components/crm/CompanyOpportunitiesCard";
import type { PersistedContactDisplay } from "@/lib/supabase/persisted-contacts";
import type { StpAccountDetail } from "@/lib/supabase/stp-current";
import type { OpportunityRecord } from "@/lib/crm/opportunity";
import type { CrmStageRecord } from "@/lib/supabase/master-data";

function scoreLabel(value: number | null | undefined): string {
  return value == null ? "UNKNOWN" : String(value);
}

export function TargetAccountDetail({
  detail,
  backHref,
  persistedContacts,
  opportunities,
  stages,
  crmError,
}: {
  detail: StpAccountDetail;
  backHref: string;
  persistedContacts: PersistedContactDisplay[];
  opportunities: OpportunityRecord[];
  stages: CrmStageRecord[];
  crmError?: string | null;
}) {
  const dimensions = [
    ["Industry Fit", detail.industryFit],
    ["Application Fit", detail.applicationFit],
    ["Service Need Fit", detail.serviceNeedFit],
    ["Commercial Potential", detail.commercialPotential],
    ["Customer Type Fit", detail.customerTypeFit],
    ["Geographic Fit", detail.geographicFit],
    ["Strategic Fit", detail.strategicFit],
  ] as const;

  return (
    <div className="space-y-4">
      <p className="text-sm flex flex-wrap gap-4">
        <Link className="text-teal-700 hover:underline" href={backHref}>
          Back to ranked accounts
        </Link>
        <Link className="text-teal-700 hover:underline" href={`/crm?service=${encodeURIComponent(detail.serviceCode)}`}>
          Open pipeline
        </Link>
        {detail.serviceCode === "PCH" && detail.rank === 1 ? (
          <Link className="text-teal-700 hover:underline" href="/targeting/capture">
            Contact capture worksheet
          </Link>
        ) : null}
      </p>

      <Card>
        <CardHeader
          title={detail.companyName}
          description={`${detail.serviceCode} · ${detail.serviceName} · persisted current STP only`}
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs text-steel-500">Rank</p>
            <p className="text-lg font-semibold text-navy-900">{detail.rank}</p>
          </div>
          <div>
            <p className="text-xs text-steel-500">Tier</p>
            <p className="mt-1">{detail.tier ? <TierBadge tier={detail.tier} /> : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-steel-500">Commercial score</p>
            <p className="text-lg font-semibold text-navy-900">{scoreLabel(detail.commercialScore)}</p>
            {detail.commercialScore != null ? <ProgressBar value={detail.commercialScore} /> : null}
          </div>
          <div>
            <p className="text-xs text-steel-500">Data confidence</p>
            <p className="font-semibold text-navy-900">
              {detail.dataConfidenceBand ?? "—"}
              {detail.dataConfidenceScore != null ? ` ${detail.dataConfidenceScore}` : ""}
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Company" />
          <CardBody className="space-y-2 text-sm">
            <p>
              <span className="text-steel-500">Entity: </span>
              {detail.entityType ?? "Unspecified"}
            </p>
            <p>
              <span className="text-steel-500">Industry: </span>
              {detail.industry ?? "—"}
            </p>
            <p>
              <span className="text-steel-500">Subsector: </span>
              {detail.subsector ?? "—"}
            </p>
            <p>
              <span className="text-steel-500">Customer type: </span>
              {detail.customerType ?? "—"}
            </p>
            <p>
              <span className="text-steel-500">Imported HQ city (not used as verified geo): </span>
              {detail.importedCity ?? "—"}
            </p>
            <p className="break-all text-xs text-steel-500">Account group: {detail.accountGroupKey}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Eligibility" />
          <CardBody className="space-y-2 text-sm">
            <p>
              <span className="text-steel-500">Decision: </span>
              {detail.eligibility}
              {detail.rankingEligible ? " · ranking eligible" : " · not ranking eligible"}
            </p>
            <p className="whitespace-pre-wrap text-steel-700">{detail.eligibilityReason ?? "—"}</p>
            <p className="text-xs text-steel-500">
              Known weight {detail.knownWeightTotal ?? "—"}% · model {detail.scoringModelVersion ?? "—"}
              {detail.scoredAt ? ` · scored ${detail.scoredAt}` : ""}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="STP dimensions" description="Stored scores. UNKNOWN is shown as UNKNOWN, not zero." />
        <CardBody className="overflow-x-auto">
          <Table>
            <THead>
              <Th>Dimension</Th>
              <Th>Score</Th>
            </THead>
            <tbody>
              {dimensions.map(([label, value]) => (
                <tr key={label} className="border-b border-steel-100 last:border-0">
                  <Td>{label}</Td>
                  <Td className="font-semibold">{scoreLabel(value)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Verified locations" description="HIGH-confidence company_locations only. Missing location stays UNKNOWN." />
        <CardBody>
          {detail.verifiedLocations.length === 0 ? (
            <p className="text-sm text-steel-500">No verified HIGH locations for this representative. Geographic Fit is {scoreLabel(detail.geographicFit)}.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {detail.verifiedLocations.map((location) => (
                <li key={`${location.city}-${location.sourceUrl ?? ""}`}>
                  <span className="font-medium">{location.city}</span>
                  {location.locationType ? ` · ${location.locationType}` : ""}
                  {location.confidence ? ` · ${location.confidence}` : ""}
                  {location.sourceName ? ` · ${location.sourceName}` : ""}
                  {location.sourceUrl ? (
                    <>
                      {" · "}
                      <a className="text-teal-700 hover:underline" href={location.sourceUrl} target="_blank" rel="noreferrer">
                        source
                      </a>
                    </>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Positioning and sales rationale" />
        <CardBody className="space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-steel-500">Positioning</p>
            <p className="mt-1 whitespace-pre-wrap text-navy-900">{detail.positioningStatement ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-steel-500">Why target</p>
            <p className="mt-1 whitespace-pre-wrap text-steel-700">{detail.targetingReason ?? "—"}</p>
          </div>
          <p>
            <span className="text-steel-500">Recommended contact roles: </span>
            {detail.recommendedContactRoles.join(", ") || "—"}
          </p>
          {detail.recommendedDepartments.length > 0 ? (
            <p>
              <span className="text-steel-500">Departments: </span>
              {detail.recommendedDepartments.join(", ")}
            </p>
          ) : null}
          {detail.dataConfidenceExplanation ? (
            <p className="text-xs text-steel-500">{detail.dataConfidenceExplanation}</p>
          ) : null}
        </CardBody>
      </Card>

      <PersistedNamedContactsCard serviceCode={detail.serviceCode} contacts={persistedContacts} />
      <CompanyOpportunitiesCard
        companyId={detail.companyId}
        companyName={detail.companyName}
        serviceId={detail.serviceId}
        serviceCode={detail.serviceCode}
        stages={stages}
        contacts={persistedContacts.map((contact) => ({ id: contact.id, fullName: contact.fullName }))}
        opportunities={opportunities}
        errorMessage={crmError}
      />
      <ServicePersonaTargets serviceCode={detail.serviceCode} />
      <ContactCollectionRulesCard />
    </div>
  );
}
