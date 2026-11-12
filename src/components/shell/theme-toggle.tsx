"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { useI18n } from "@/i18n/client";

type Theme = "system" | "light" | "dark";

const ORDER: Theme[] = ["system", "light", "dark"];
const ICON = { system: Monitor, light: Sun, dark: Moon };

const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyTheme(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // storage unavailable (private mode): the choice lasts for this page only
  }
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Cycles between following the system, light and dark. */
export function ThemeToggle() {
  // the server cannot know the stored choice; it renders "system" and the
  // client corrects the label after hydration
  const theme = useSyncExternalStore<Theme>(subscribe, readTheme, () => "system");
  const { t } = useI18n();
  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const label = t(`theme.${theme}`);

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      title={t(`theme.switch.${next}`, { theme: label })}
      className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-ink-2 transition-colors hover:bg-wash hover:text-ink"
    >
      <Icon aria-hidden className="size-4" strokeWidth={1.75} />
      <span>
        {t.rich("theme.current", {
          theme: label,
          label: (content) => <span className="sr-only">{content}</span>,
        })}
      </span>
    </button>
  );
}
