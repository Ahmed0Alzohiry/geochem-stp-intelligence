import { APP_NAME } from "@/lib/constants";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-steel-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 pl-14 pr-4 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-sm font-semibold tracking-wide text-navy-900 sm:text-base">
            {APP_NAME}
          </h1>
          <p className="hidden text-xs text-steel-500 sm:block">
            Segmentation · Targeting · Positioning
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-navy-900">Ahmed</p>
            <p className="text-xs text-steel-500">Commercial Intelligence</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-navy-900 text-xs font-semibold text-brass-400">
            AH
          </div>
        </div>
      </div>
    </header>
  );
}
