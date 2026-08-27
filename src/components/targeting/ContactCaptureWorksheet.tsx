"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Select } from "@/components/ui/FormControls";
import { ContactPersistGrainPolicyCard } from "@/components/targeting/ContactPersistGrainPolicyCard";
import { CONTACT_SOURCE_RULES } from "@/lib/contacts/collection-rules";
import {
  CONTACT_WORKSHEET_VERSION,
  EMPTY_WORKSHEET_DRAFT,
  evaluateWorksheet,
  personaOptionsForService,
  type WorksheetAccountContext,
  type WorksheetDecision,
  type WorksheetDraft,
} from "@/lib/contacts/worksheet";
import type { ContactEvidenceType, ContactSourceConfidence, ContactVerificationStatus } from "@/types/contact-intelligence";

const INPUT_CLASS =
  "mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm text-navy-900 outline-none placeholder:text-steel-500 focus:border-teal-600";

const DECISION_VARIANT: Record<WorksheetDecision, "success" | "brass" | "danger"> = {
  ACCEPT: "success",
  REVIEW: "brass",
  REJECT: "danger",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-steel-600">
      {label}
      {children}
    </label>
  );
}

export function ContactCaptureWorksheet({
  account,
}: {
  account: WorksheetAccountContext;
}) {
  const personas = personaOptionsForService(account.serviceCode);
  const [draft, setDraft] = useState<WorksheetDraft>({
    ...EMPTY_WORKSHEET_DRAFT,
    personaKey: personas[0]?.key ?? "",
  });
  const [evaluated, setEvaluated] = useState(false);

  const result = useMemo(() => evaluateWorksheet(account, draft), [account, draft]);

  function patch(partial: Partial<WorksheetDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
    setEvaluated(false);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Ranked account (locked)"
          description={`${CONTACT_WORKSHEET_VERSION} · Human capture only. Do not invent names. Nothing is saved to Supabase.`}
        />
        <CardBody className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
          <div>
            <p className="text-xs text-steel-500">Company</p>
            <p className="font-semibold text-navy-900">{account.companyName}</p>
          </div>
          <div>
            <p className="text-xs text-steel-500">Service</p>
            <p className="font-semibold text-navy-900">
              {account.serviceCode} · {account.serviceName}
            </p>
          </div>
          <div>
            <p className="text-xs text-steel-500">STP rank / tier / score</p>
            <p className="font-semibold text-navy-900">
              {account.rank} · {account.tier ?? "—"} · {account.commercialScore ?? "UNKNOWN"}
            </p>
          </div>
          <div>
            <p className="text-xs text-steel-500">Existing contacts (account group)</p>
            <p className="font-semibold text-navy-900">{account.existingAtCompany.length}</p>
          </div>
        </CardBody>
      </Card>

      <ContactPersistGrainPolicyCard />

      <Card>
        <CardHeader
          title="Capture from a live public source"
          description="Copy values as printed on the source. Leave email, phone, and LinkedIn blank unless the page shows them."
        />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Target department / job function / persona">
              <Select
                className="mt-1 w-full"
                value={draft.personaKey}
                onChange={(value) => patch({ personaKey: value })}
                options={personas.map((row) => ({ value: row.key, label: row.label }))}
              />
            </Field>
            <Field label="Claimed verification status">
              <Select
                className="mt-1 w-full"
                value={draft.claimedVerification}
                onChange={(value) => patch({ claimedVerification: value as ContactVerificationStatus })}
                options={[
                  { value: "Unverified", label: "Unverified" },
                  { value: "Partially Verified", label: "Partially Verified" },
                  { value: "Verified", label: "Verified" },
                ]}
              />
            </Field>
            <Field label="Person's full name (as printed)">
              <input
                className={INPUT_CLASS}
                value={draft.fullName}
                onChange={(event) => patch({ fullName: event.target.value })}
                placeholder="Leave blank until a public page names a person"
              />
            </Field>
            <Field label="Job title (as printed)">
              <input
                className={INPUT_CLASS}
                value={draft.jobTitle}
                onChange={(event) => patch({ jobTitle: event.target.value })}
              />
            </Field>
            <Field label="LinkedIn / profile URL if publicly available">
              <input
                className={INPUT_CLASS}
                value={draft.linkedinUrl}
                onChange={(event) => patch({ linkedinUrl: event.target.value })}
              />
            </Field>
            <Field label="Business email if publicly available">
              <input
                className={INPUT_CLASS}
                value={draft.email}
                onChange={(event) => patch({ email: event.target.value })}
              />
            </Field>
            <Field label="Business phone if publicly available">
              <input
                className={INPUT_CLASS}
                value={draft.phone}
                onChange={(event) => patch({ phone: event.target.value })}
              />
            </Field>
            <Field label="Source URL">
              <input
                className={INPUT_CLASS}
                value={draft.sourceUrl}
                onChange={(event) => patch({ sourceUrl: event.target.value })}
                placeholder="https://"
              />
            </Field>
            <Field label="Source name">
              <input
                className={INPUT_CLASS}
                value={draft.sourceName}
                onChange={(event) => patch({ sourceName: event.target.value })}
              />
            </Field>
            <Field label="Source type">
              <Select
                className="mt-1 w-full"
                value={draft.evidenceType}
                onChange={(value) => patch({ evidenceType: value as ContactEvidenceType | "" })}
                options={[
                  { value: "", label: "Select source type" },
                  ...CONTACT_SOURCE_RULES.map((row) => ({ value: row.evidenceType, label: row.evidenceType })),
                ]}
              />
            </Field>
            <Field label="Source confidence">
              <Select
                className="mt-1 w-full"
                value={draft.sourceConfidence}
                onChange={(value) => patch({ sourceConfidence: value as ContactSourceConfidence | "" })}
                options={[
                  { value: "", label: "Select confidence" },
                  { value: "HIGH", label: "HIGH" },
                  { value: "MEDIUM", label: "MEDIUM" },
                  { value: "LOW", label: "LOW" },
                ]}
              />
            </Field>
            <Field label="Verification date (required only if Verified)">
              <input
                type="date"
                className={INPUT_CLASS}
                value={draft.verifiedAt}
                onChange={(event) => patch({ verifiedAt: event.target.value })}
              />
            </Field>
            <Field label="Company name as printed on the source">
              <input
                className={INPUT_CLASS}
                value={draft.companyNameOnSource}
                onChange={(event) => patch({ companyNameOnSource: event.target.value })}
              />
            </Field>
          </div>
          <Field label="Evidence (what the public page showed)">
            <textarea
              className="mt-1 min-h-24 w-full rounded-md border border-steel-200 bg-white px-3 py-2 text-sm text-navy-900 outline-none placeholder:text-steel-500 focus:border-teal-600"
              value={draft.evidenceNotes}
              onChange={(event) => patch({ evidenceNotes: event.target.value })}
              placeholder="Quote or paraphrase the line that names the person and role. Do not guess."
            />
          </Field>
          <div className="grid gap-2 text-sm text-navy-900 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.sourceShowsCurrentRole}
                onChange={(event) => patch({ sourceShowsCurrentRole: event.target.checked })}
              />
              Source shows a current role at this company
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.sourceConfirmsSameCompany}
                onChange={(event) => patch({ sourceConfirmsSameCompany: event.target.checked })}
              />
              Source names the same ranked company
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.sourceShowsEmail}
                onChange={(event) => patch({ sourceShowsEmail: event.target.checked })}
              />
              Email is printed on the source
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.sourceShowsPhone}
                onChange={(event) => patch({ sourceShowsPhone: event.target.checked })}
              />
              Phone is printed on the source
            </label>
          </div>
          <button
            type="button"
            className="h-10 rounded-md bg-navy-900 px-4 text-sm font-medium text-white"
            onClick={() => setEvaluated(true)}
          >
            Evaluate candidate
          </button>
        </CardBody>
      </Card>

      {evaluated ? (
        <Card>
          <CardHeader title="Evaluation (STEP 7.5 rules)" />
          <CardBody className="space-y-3 text-sm">
            <p className="text-lg font-semibold text-navy-900">Decision: {result.decision}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={DECISION_VARIANT[result.decision]}>{result.decision}</Badge>
              <span className="text-steel-500">
                7.5 decision {result.rulesDecision} · derived {result.evaluation.derivedVerification}
                {result.evaluation.sourceTier ? ` · tier ${result.evaluation.sourceTier}` : ""}
              </span>
            </div>
            {result.grain ? (
              <p className="text-navy-900">
                Persist grain: {result.grain.grain ?? "unresolved"} · attach to{" "}
                {result.grain.persistCompanyName ?? "—"} · display {result.grain.displayOnCaptureAs}
              </p>
            ) : null}
            <ul className="list-disc space-y-1 pl-5 text-navy-900">
              {result.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : (
        <p className="text-sm text-steel-500">Evaluate to see ACCEPT / REVIEW / REJECT. No contact is stored.</p>
      )}
    </div>
  );
}
