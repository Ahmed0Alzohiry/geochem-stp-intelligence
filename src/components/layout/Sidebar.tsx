"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  Kanban,
  Layers,
  LayoutDashboard,
  Menu,
  Settings,
  Target,
  X,
} from "lucide-react";
import { navItemIsActive, withServiceQuery } from "@/lib/navigation";
import { APP_NAME, COMPANY_NAME, NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

const ICONS = {
  LayoutDashboard,
  Building2,
  Layers,
  Target,
  Kanban,
  Settings,
} as const;

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const service = searchParams.get("service");

  return (
    <>
      <button
        type="button"
        className="fixed left-4 top-4 z-40 rounded-md border border-steel-200 bg-white p-2 text-navy-900 shadow-sm lg:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-navy-950/50 lg:hidden"
          aria-label="Close navigation overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col bg-navy-900 text-navy-100 transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-5">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-brass-400 uppercase">
              GEOCHEM ARABIA
            </p>
            <p className="mt-1 text-sm font-semibold text-white">{APP_NAME}</p>
            <p className="mt-1 text-xs text-navy-100/70">{COMPANY_NAME}</p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-navy-100 lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon];
            const preservesService = item.href === "/" || item.href === "/targeting" || item.href === "/crm";
            const href = preservesService ? withServiceQuery(item.href, service) : item.href;
            const active = navItemIsActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-teal-700 text-white"
                    : "text-navy-100/80 hover:bg-navy-800 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-5 py-4 text-xs text-navy-100/60">
          Kingdom of Saudi Arabia
        </div>
      </aside>
    </>
  );
}
