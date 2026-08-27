import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "teal",
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  accent?: "teal" | "brass" | "navy" | "success";
}) {
  const accents = {
    teal: "bg-teal-50 text-teal-700",
    brass: "bg-brass-50 text-warning-700",
    navy: "bg-navy-100 text-navy-900",
    success: "bg-success-50 text-success-700",
  };

  return (
    <article className="rounded-lg border border-steel-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-steel-500 uppercase">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-navy-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-steel-500">{hint}</p> : null}
        </div>
        <span className={cn("rounded-md p-2", accents[accent])}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}
