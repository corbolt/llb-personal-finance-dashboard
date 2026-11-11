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

import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ReceiptText },
  { href: "/spending", label: "Spending", icon: ChartColumn },
  { href: "/recurring", label: "Recurring", icon: Repeat },
  { href: "/budgets", label: "Budgets", icon: Target },
];

const SECONDARY: NavItem[] = [
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/import", label: "Import", icon: Upload },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
        active ? "bg-wash font-medium text-ink" : "text-ink-2 hover:bg-wash/70 hover:text-ink",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={active ? 2 : 1.75} />
      {item.label}
    </Link>
  );
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:overflow-visible lg:px-3 lg:pb-0"
    >
      {PRIMARY.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
      <div aria-hidden className="mx-1 w-px shrink-0 bg-line lg:mx-0 lg:my-2 lg:h-px lg:w-auto" />
      {SECONDARY.map((item) => (
        <NavLink key={item.href} item={item} pathname={pathname} />
      ))}
    </nav>
  );
}
