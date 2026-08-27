import { Card } from "@/components/ui/Card";
import { MasterDataEmpty } from "@/components/ui/MasterDataStatus";

export function SegmentationFlow({
  industries,
  customerTypes,
  services,
  regions,
}: {
  industries: string[];
  customerTypes: string[];
  services: string[];
  regions: string[];
}) {
  const steps = [
    {
      title: "Industry",
      caption: "Where GEOCHEM can create laboratory demand",
      items: industries,
    },
    {
      title: "Customer Type",
      caption: "Who buys and specifies testing work",
      items: customerTypes,
    },
    {
      title: "Service Need",
      caption: "GEOCHEM service lines available to the market",
      items: services,
    },
    {
      title: "Geography",
      caption: "Saudi operating footprint",
      items: regions,
    },
    {
      title: "Account Potential",
      caption: "Strategic value of the relationship",
      items: ["Strategic", "Growth", "Development", "Transactional"],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.title} className="flex flex-col gap-3">
            <Card className="h-full">
              <div className="border-b border-steel-100 bg-navy-900 px-4 py-3 text-white">
                <p className="text-[11px] tracking-[0.16em] text-brass-400 uppercase">
                  Step {index + 1}
                </p>
                <h3 className="mt-1 text-sm font-semibold">{step.title}</h3>
              </div>
              <div className="px-4 py-3">
                <p className="mb-3 text-xs text-steel-500">{step.caption}</p>
                {step.items.length === 0 ? (
                  <MasterDataEmpty label="No values returned." />
                ) : (
                  <ul className="space-y-2">
                    {step.items.map((item) => (
                      <li
                        key={item}
                        className="rounded-md border border-steel-100 bg-steel-50 px-3 py-2 text-sm text-navy-900"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
            {index < steps.length - 1 ? (
              <p className="hidden text-center text-xs font-semibold tracking-[0.2em] text-teal-700 uppercase xl:block">
                →
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <p className="text-center text-sm font-medium text-teal-700 xl:hidden">
        Industry → Customer Type → Service Need → Geography → Account Potential
      </p>
    </div>
  );
}
