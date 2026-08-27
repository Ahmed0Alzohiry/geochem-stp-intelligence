"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createOpportunity } from "@/lib/supabase/opportunities";
import { defaultProbabilityForStage } from "@/lib/crm/pipeline-stages";
import { computeWeightedValue } from "@/lib/crm/opportunity";
import { formatSar } from "@/lib/utils";
import type { CrmStageRecord } from "@/lib/supabase/master-data";

export function OpportunityForm({
  companyId,
  companyName,
  serviceId,
  serviceCode,
  stages,
  contacts,
  source = "Target Account",
  defaultOpen = false,
}: {
  companyId: string;
  companyName: string;
  serviceId: string;
  serviceCode: string;
  stages: CrmStageRecord[];
  contacts: { id: string; fullName: string }[];
  source?: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const defaultStage = stages.find((stage) => stage.name === "Lead") ?? stages[0];
  const [open, setOpen] = useState(defaultOpen);
  const [opportunityName, setOpportunityName] = useState(`${companyName} ${serviceCode}`);
  const [stageId, setStageId] = useState(defaultStage?.id ?? "");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [expectedCloseDate, setExpectedCloseDate] = useState("");
  const [contactId, setContactId] = useState("");
  const [notes, setNotes] = useState("");
  const [owner, setOwner] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedStage = stages.find((stage) => stage.id === stageId);
  const probability = selectedStage
    ? Number(selectedStage.default_probability ?? defaultProbabilityForStage(selectedStage.name))
    : 10;
  const previewWeighted = useMemo(() => {
    const value = Number(estimatedValue);
    if (!Number.isFinite(value) || value < 0) return null;
    return computeWeightedValue(value, probability);
  }, [estimatedValue, probability]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      await createOpportunity({
        companyId,
        serviceId,
        opportunityName,
        stageId,
        estimatedValue: Number(estimatedValue),
        expectedCloseDate,
        contactId: contactId || null,
        notes,
        owner,
        source,
        probability,
      });
      setSuccess("Opportunity created successfully");
      setEstimatedValue("");
      setExpectedCloseDate("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setSuccess(null);
      setError(err instanceof Error ? err.message : "Unable to create opportunity.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    if (stages.length === 0) return null;
    return (
      <button
        type="button"
        className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
        onClick={() => setOpen(true)}
      >
        + Create Opportunity
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-steel-200 bg-steel-50 p-4">
      <p className="text-xs text-steel-500">
        {companyName} · {serviceCode}. Company and service are taken from this account.
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
          onChange={(event) => setStageId(event.target.value)}
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
      <p className="text-xs text-steel-500">
        Probability {probability}%
        {previewWeighted != null ? ` · Weighted ${formatSar(previewWeighted)}` : ""}
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
        <span className="text-steel-600">Owner (optional)</span>
        <input
          value={owner}
          onChange={(event) => setOwner(event.target.value)}
          className="mt-1 h-10 w-full rounded-md border border-steel-200 bg-white px-3 text-sm"
        />
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
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save opportunity"}
        </button>
        <button
          type="button"
          className="rounded-md border border-steel-200 bg-white px-3 py-2 text-sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
