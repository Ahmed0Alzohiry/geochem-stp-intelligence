"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { deleteSystemTestOpportunity, updateOpportunity } from "@/lib/supabase/opportunities";
import { defaultProbabilityForStage } from "@/lib/crm/pipeline-stages";
import { computeWeightedValue, isSystemTestOpportunity } from "@/lib/crm/opportunity";
import { formatSar } from "@/lib/utils";
import type { OpportunityRecord } from "@/lib/crm/opportunity";
import type { CrmStageRecord } from "@/lib/supabase/master-data";

export function OpportunityEditForm({
  opportunity,
  stages,
  contacts,
}: {
  opportunity: OpportunityRecord;
  stages: CrmStageRecord[];
  contacts: { id: string; fullName: string }[];
}) {
  const router = useRouter();
  const [opportunityName, setOpportunityName] = useState(opportunity.opportunityName);
  const [stageId, setStageId] = useState(opportunity.stageId);
  const [estimatedValue, setEstimatedValue] = useState(String(opportunity.estimatedValue));
  const [probability, setProbability] = useState(String(opportunity.probability));
  const [expectedCloseDate, setExpectedCloseDate] = useState(opportunity.expectedCloseDate ?? "");
  const [contactId, setContactId] = useState(opportunity.contactId ?? "");
  const [owner, setOwner] = useState(opportunity.owner ?? "");
  const [notes, setNotes] = useState(opportunity.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const parsedProbability = Number(probability);
  const previewWeighted = useMemo(() => {
    const value = Number(estimatedValue);
    if (!Number.isFinite(value) || value < 0 || !Number.isFinite(parsedProbability)) return null;
    return computeWeightedValue(value, parsedProbability);
  }, [estimatedValue, parsedProbability]);

  const canDelete = isSystemTestOpportunity({
    opportunityName,
    notes,
    source: opportunity.source,
    owner,
    estimatedValue: Number(estimatedValue),
  });

  function onStageChange(nextStageId: string) {
    setStageId(nextStageId);
    const stage = stages.find((item) => item.id === nextStageId);
    if (stage) {
      setProbability(String(Number(stage.default_probability ?? defaultProbabilityForStage(stage.name))));
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await updateOpportunity(opportunity.id, {
        opportunityName,
        stageId,
        estimatedValue: Number(estimatedValue),
        probability: Number(probability),
        expectedCloseDate: expectedCloseDate || null,
        contactId: contactId || null,
        owner,
        notes,
      });
      setSuccess("Opportunity updated successfully");
      router.refresh();
    } catch (err) {
      setSuccess(null);
      setError(err instanceof Error ? err.message : "Unable to update opportunity.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setError(null);
    setSuccess(null);
    setDeleting(true);
    try {
      await deleteSystemTestOpportunity(opportunity.id);
      setSuccess("System-test opportunity deleted");
      router.push(opportunity.serviceCode ? `/crm?service=${encodeURIComponent(opportunity.serviceCode)}` : "/crm");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete opportunity.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-xs text-steel-500">
        {opportunity.companyName} · {opportunity.serviceCode ?? opportunity.serviceName}. Company and service stay on
        this opportunity.
      </p>
      <label className="block text-sm">
        <span className="text-steel-600">Opportunity Name</span>
        <input
          required
          value={opportunityName}
          onChange={(event) => setOpportunityName(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-steel-600">Stage</span>
        <select
          required
          value={stageId}
          onChange={(event) => onStageChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        >
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name} ({Number(stage.default_probability ?? defaultProbabilityForStage(stage.name))}%)
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-steel-600">Estimated Value (SAR)</span>
        <input
          required
          type="number"
          min="0"
          step="0.01"
          value={estimatedValue}
          onChange={(event) => setEstimatedValue(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-steel-600">Probability (%)</span>
        <input
          required
          type="number"
          min="0"
          max="100"
          step="1"
          value={probability}
          onChange={(event) => setProbability(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        />
      </label>
      <p className="text-xs text-steel-500">
        Weighted {previewWeighted != null ? formatSar(previewWeighted) : "—"} (estimated × probability / 100)
      </p>
      <label className="block text-sm">
        <span className="text-steel-600">Expected Close Date</span>
        <input
          required
          type="date"
          value={expectedCloseDate}
          onChange={(event) => setExpectedCloseDate(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-steel-600">Owner (optional)</span>
        <input
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-steel-600">Contact (optional)</span>
        <select
          value={contactId}
          onChange={(event) => setContactId(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        >
          <option value="">None</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.fullName}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-steel-600">Notes (optional)</span>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className="mt-1 w-full rounded-md border border-steel-200 bg-white px-3 py-2 text-sm"
        />
      </label>
      {error ? <p className="text-sm text-danger-700">{error}</p> : null}
      {success ? <p className="text-sm text-success-700">{success}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving || deleting}
          className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {canDelete ? (
          <button
            type="button"
            disabled={saving || deleting}
            onClick={() => void onDelete()}
            className="rounded-md border border-danger-200 bg-white px-3 py-2 text-sm text-danger-700 hover:bg-danger-50 disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete system-test opportunity"}
          </button>
        ) : null}
      </div>
    </form>
  );
}
