import Link from "next/link";
import { Suspense } from "react";

import { formatDate } from "@/lib/dates";
import { APP_NAME } from "@/lib/site";
import { requestDb } from "@/server/db/request";
import { getDataRange } from "@/server/queries/accounts";

import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-ink">
      <svg viewBox="0 0 32 32" aria-hidden className="size-7 shrink-0">
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <path
          d="M10 23V9h6.6a4.4 4.4 0 0 1 1.2 8.63L21.5 23M10 17.8h7"
          fill="none"
          className="stroke-surface"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
    </Link>
  );
}

/** How current the data is — the app only knows what the last import contained. */
async function DataStatus() {
  const db = await requestDb();
  const { coveredThrough } = getDataRange(db);
  if (!coveredThrough) return null;
  return (
    <p className="px-2.5 text-xs leading-relaxed text-ink-3">
      Data through
      <br />
      <span className="text-ink-2">{formatDate(coveredThrough)}</span>
    </p>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 z-10 border-b border-line bg-plane/95 backdrop-blur lg:h-dvh lg:border-r lg:border-b-0">
      <div className="flex h-full flex-col lg:py-4">
        <div className="flex items-center justify-between px-3 py-2.5 lg:px-3 lg:pt-0 lg:pb-4">
          <Brand />
          <div className="lg:hidden">
            <ThemeToggle />
          </div>
        </div>
        <NavLinks />
        <div className="mt-auto hidden flex-col gap-3 px-3 lg:flex">
          <Suspense fallback={null}>
            <DataStatus />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
