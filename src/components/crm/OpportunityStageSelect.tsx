"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateOpportunity } from "@/lib/supabase/opportunities";
import type { CrmStageRecord } from "@/lib/supabase/master-data";

export function OpportunityStageSelect({
  opportunityId,
  stageId,
  stages,
}: {
  opportunityId: string;
  stageId: string;
  stages: CrmStageRecord[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(stageId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: string) {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      await updateOpportunity(opportunityId, { stageId: next });
      router.refresh();
    } catch (err) {
      setValue(previous);
      setError(err instanceof Error ? err.message : "Unable to update stage.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <select
        value={value}
        disabled={saving}
        onChange={(event) => void onChange(event.target.value)}
        aria-label="CRM stage"
        className="h-9 max-w-full rounded-md border border-steel-200 bg-white px-2 text-xs text-navy-900"
      >
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>
            {stage.name}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}
