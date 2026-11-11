import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Cake,
  Camera,
  Car,
  CircleDashed,
  CircleHelp,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Dog,
  Dumbbell,
  Flame,
  Flower2,
  Fuel,
  Gamepad2,
  Gift,
  Globe,
  GraduationCap,
  Hammer,
  HandCoins,
  HeartPulse,
  House,
  Landmark,
  Leaf,
  Lightbulb,
  Monitor,
  Music,
  Package,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingBasket,
  Sofa,
  Sparkles,
  Tag,
  Ticket,
  TrainFront,
  TrendingUp,
  Undo2,
  Users,
  Utensils,
  Wallet,
  Wine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Icons a category can use. Categories store the icon by name; keeping the
 * set explicit means only these icons end up in the bundle.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  ShoppingBasket,
  Utensils,
  ShoppingBag,
  Sofa,
  House,
  Zap,
  ShieldCheck,
  HeartPulse,
  Scissors,
  Car,
  Plane,
  Clapperboard,
  Monitor,
  Baby,
  GraduationCap,
  PawPrint,
  Gift,
  Landmark,
  Receipt,
  CreditCard,
  Banknote,
  CircleHelp,
  Briefcase,
  HandCoins,
  Undo2,
  TrendingUp,
  Coins,
  ArrowLeftRight,
  PiggyBank,
  // extras for categories people add themselves
  Bike,
  BookOpen,
  Bus,
  Cake,
  Camera,
  Coffee,
  Dog,
  Dumbbell,
  Flame,
  Flower2,
  Fuel,
  Gamepad2,
  Globe,
  Hammer,
  Leaf,
  Lightbulb,
  Music,
  Package,
  Phone,
  Pill,
  Shirt,
  Sparkles,
  Tag,
  Ticket,
  TrainFront,
  Users,
  Wallet,
  Wine,
  Wrench,
};

export const CATEGORY_ICON_NAMES = Object.keys(CATEGORY_ICONS);

/** Everything a stored icon name can resolve to, including the "no category" glyph. */
const GLYPHS: Record<string, LucideIcon | undefined> = { ...CATEGORY_ICONS, CircleDashed };

/** The bare glyph. A missing name means "uncategorised"; an unknown one falls back to a tag. */
export function CategoryGlyph({
  name,
  className,
}: {
  name: string | null | undefined;
  className?: string;
}) {
  const Icon = (name ? GLYPHS[name] : CircleDashed) ?? Tag;
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} strokeWidth={1.75} />;
}

/** The glyph on a quiet tile, as used at the start of list rows. */
export function CategoryIcon({
  name,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg bg-wash text-ink-2",
        size === "md" ? "size-9" : "size-7 rounded-md",
        !name && "border border-dashed border-axis bg-transparent text-ink-3",
        className,
      )}
    >
      <CategoryGlyph name={name} className={size === "md" ? "size-[18px]" : "size-3.5"} />
    </span>
  );
}
