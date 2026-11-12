import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { Sidebar } from "@/components/shell/sidebar";
import { THEME_SCRIPT } from "@/components/shell/theme-script";
import { I18nProvider } from "@/i18n/client";
import { locales } from "@/i18n/config";
import { catalogs } from "@/i18n/messages";
import { getI18n } from "@/i18n/server";
import { APP_NAME } from "@/lib/site";

import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** One static shell per language. */
export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
    description: t("app.tagline"),
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d0d" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getI18n();
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <I18nProvider locale={locale} messages={catalogs[locale]}>
          <div className="app-root min-h-dvh lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]">
            <Sidebar />
            <main className="min-w-0">
              <div className="mx-auto w-full max-w-[70rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
                {children}
              </div>
            </main>
          </div>
          <Toaster
            position="bottom-right"
            containerAriaLabel={t("shell.notifications")}
            toastOptions={{
              style: {
                background: "var(--popover)",
                color: "var(--ink)",
                border: "1px solid var(--line)",
                boxShadow: "var(--shadow-popover)",
                fontFamily: "inherit",
              },
            }}
          />
        </I18nProvider>
      </body>
    </html>
  );
}
