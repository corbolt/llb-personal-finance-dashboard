"use client";

import { Select } from "@base-ui/react/select";
import { Check, Languages } from "lucide-react";

import { useI18n } from "@/i18n/client";
import { isLocale, LOCALE_COOKIE, localeNames, locales, switchLocalePath, type Locale } from "@/i18n/config";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Shows the current page in another language. The choice goes into a cookie,
 * which the proxy reads for addresses that name no language (a bookmark of
 * `/`, say). The page is loaded afresh rather than navigated to: the language
 * belongs to the root layout, which a client-side navigation would keep.
 */
function switchTo(locale: Locale) {
  const { pathname, search, hash } = window.location;
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  window.location.assign(switchLocalePath(pathname, locale) + search + hash);
}

/** Menu of the interface languages, each under its own name. */
export function LanguageSwitcher({
  compact = false,
}: {
  /** Show the language code instead of its name, for the narrow top bar. */
  compact?: boolean;
}) {
  const { locale, t } = useI18n();

  return (
    <Select.Root
      value={locale}
      onValueChange={(next) => {
        if (isLocale(next) && next !== locale) switchTo(next);
      }}
    >
      <Select.Trigger
        aria-label={`${t("language.label")}: ${localeNames[locale]}`}
        className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ink-2 transition-colors select-none hover:bg-wash hover:text-ink data-popup-open:bg-wash data-popup-open:text-ink"
      >
        <Languages aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{compact ? locale.split("-")[0].toUpperCase() : localeNames[locale]}</span>
      </Select.Trigger>

      <Select.Portal>
        <Select.Positioner alignItemWithTrigger={false} sideOffset={6} align="start" className="z-50 outline-none">
          <Select.Popup className="min-w-52 origin-(--transform-origin) rounded-xl border border-line bg-popover py-1.5 shadow-popover outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-[0.98] data-ending-style:opacity-0 data-starting-style:scale-[0.98] data-starting-style:opacity-0">
            <Select.List>
              {locales.map((option) => (
                <Select.Item
                  key={option}
                  value={option}
                  className="mx-1.5 flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-ink outline-none select-none data-highlighted:bg-wash"
                >
                  {/* each name is written in its own language, and says so to screen readers */}
                  <Select.ItemText lang={option} className="truncate">
                    {localeNames[option]}
                  </Select.ItemText>
                  <Select.ItemIndicator className="ml-auto pl-3 text-ink">
                    <Check aria-hidden className="size-3.5" strokeWidth={2.25} />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
