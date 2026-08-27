import { cn } from "@/lib/utils";

const variants = {
  default: "border-steel-200 bg-steel-100 text-steel-700",
  teal: "border-teal-50 bg-teal-50 text-teal-700",
  brass: "border-brass-50 bg-brass-50 text-warning-700",
  success: "border-success-50 bg-success-50 text-success-700",
  danger: "border-danger-50 bg-danger-50 text-danger-700",
  navy: "border-navy-100 bg-navy-100 text-navy-900",
} as const;

type BadgeVariant = keyof typeof variants;

const TIER_VARIANTS: Record<string, BadgeVariant> = {
  "Tier 1": "brass",
  "Tier 2": "teal",
  "Tier 3": "navy",
  Watch: "default",
  Watchlist: "default",
};

const STAGE_VARIANTS: Record<string, BadgeVariant> = {
  Lead: "default",
  Prospect: "default",
  Contacted: "navy",
  Qualified: "teal",
  Meeting: "teal",
  Proposal: "brass",
  Negotiation: "brass",
  Won: "success",
  Lost: "danger",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TierBadge({ tier }: { tier: string }) {
  return <Badge variant={TIER_VARIANTS[tier] ?? "default"}>{tier}</Badge>;
}

export function StageBadge({ stage }: { stage: string }) {
  return <Badge variant={STAGE_VARIANTS[stage] ?? "default"}>{stage}</Badge>;
}
