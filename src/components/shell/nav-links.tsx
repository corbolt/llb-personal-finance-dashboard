"use client";

import {
  ChartColumn,
  LayoutDashboard,
  ReceiptText,
  Repeat,
  Tags,
  Target,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useI18n } from "@/i18n/client";
import type { MessageKey } from "@/i18n/messages";
import { cn } from "@/lib/cn";

interface NavItem {
  /** The page, without the language: `/budgets`. */
  path: string;
  label: MessageKey & `nav.${string}`;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { path: "/", label: "nav.overview", icon: LayoutDashboard },
  { path: "/transactions", label: "nav.transactions", icon: ReceiptText },
  { path: "/spending", label: "nav.spending", icon: ChartColumn },
  { path: "/recurring", label: "nav.recurring", icon: Repeat },
  { path: "/budgets", label: "nav.budgets", icon: Target },
];

const SECONDARY: NavItem[] = [
  { path: "/categories", label: "nav.categories", icon: Tags },
  { path: "/import", label: "nav.import", icon: Upload },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const { t, link } = useI18n();
  const href = link(item.path);
  // the overview is only "current" on its own address, not on every page below it
  const active = pathname === href || (item.path !== "/" && pathname.startsWith(`${href}/`));
  const Icon = item.icon;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
        active ? "bg-wash font-medium text-ink" : "text-ink-2 hover:bg-wash/70 hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
      {t(item.label)}
    </Link>
  );
}

export function NavLinks() {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t("nav.label")}
      className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0"
    >
      {PRIMARY.map((item) => (
        <NavLink key={item.path} item={item} pathname={pathname} />
      ))}
      <div aria-hidden className="mx-1 w-px shrink-0 bg-line lg:mx-0 lg:my-2 lg:h-px lg:w-auto" />
      {SECONDARY.map((item) => (
        <NavLink key={item.path} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
