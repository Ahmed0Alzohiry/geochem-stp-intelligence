import { StageBadge } from "@/components/ui/Badge";
import { formatSar } from "@/lib/utils";
import { opportunities } from "@/data/mock";

export function PipelineBoard({ stages }: { stages: string[] }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-4">
        {stages.map((stage) => (
          <PipelineColumn key={stage} stage={stage} />
        ))}
      </div>
    </div>
  );
}

function PipelineColumn({ stage }: { stage: string }) {
  const cards = opportunities.filter((opportunity) => opportunity.stage === stage);
  const total = cards.reduce((sum, opportunity) => sum + opportunity.valueSar, 0);

  return (
    <section className="w-72 shrink-0 rounded-lg border border-steel-200 bg-steel-50">
      <header className="flex items-center justify-between border-b border-steel-200 px-3 py-3">
        <div>
          <StageBadge stage={stage} />
          <p className="mt-1 text-xs text-steel-500">
            {cards.length} {cards.length === 1 ? "opportunity" : "opportunities"}
          </p>
        </div>
        <p className="text-xs font-semibold text-navy-900">{formatSar(total)}</p>
      </header>
      <div className="space-y-3 p-3">
        {cards.length === 0 ? (
          <p className="rounded-md border border-dashed border-steel-200 bg-white px-3 py-6 text-center text-xs text-steel-500">
            No cards in this stage
          </p>
        ) : (
          cards.map((opportunity) => (
            <article key={opportunity.id} className="rounded-md border border-steel-200 bg-white p-3 shadow-sm">
              <p className="text-sm font-semibold text-navy-900">{opportunity.companyName}</p>
              <p className="mt-1 text-xs text-steel-500">{opportunity.title}</p>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="font-medium text-teal-700">{formatSar(opportunity.valueSar)}</span>
                <span className="text-steel-500">{opportunity.owner}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
