import { NextResponse, type NextRequest } from "next/server";

import { canonicalLocale, isLocale, LOCALE_COOKIE, localizePath, negotiateLocale } from "@/i18n/config";

/**
 * Only answer requests addressed to this machine.
 *
 * The app has no login — it relies on being reachable from localhost only.
 * Binding the server to 127.0.0.1 keeps other devices out, but not a
 * malicious website: with DNS rebinding a page can point its own hostname at
 * 127.0.0.1 and then read everything here as "same origin". Such requests
 * still carry the attacker's hostname in the Host header, so refusing every
 * host that is not on the list closes that door.
 *
 * To reach the app from another device on purpose, add its hostname:
 *   ALLOWED_HOSTS=nas.local,192.168.1.20
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

const extraHosts = (process.env.ALLOWED_HOSTS ?? "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

function hostnameOf(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
  return host.split(":")[0];
}

/**
 * Framework assets (`/_next/…`) and files (`/icon.svg`) have no language.
 * Pages never have a dot in their last segment.
 */
function isAsset(pathname: string): boolean {
  return pathname.startsWith("/_next/") || /\.[^/]+$/.test(pathname);
}

/**
 * Every page lives under its language: `/de-LI/budgets`. An address without
 * one — the bare `/`, an old bookmark — is sent to the same page in the
 * language picked in the menu, or else the browser's.
 */
function withLanguage(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const [, first = ""] = pathname.split("/");
  if (isLocale(first) || isAsset(pathname)) return null;

  const url = request.nextUrl.clone();
  const misspelt = canonicalLocale(first); // `/de-li/…`
  if (misspelt) {
    url.pathname = `/${misspelt}${pathname.slice(first.length + 1)}`;
  } else {
    const locale = negotiateLocale(
      request.cookies.get(LOCALE_COOKIE)?.value,
      request.headers.get("accept-language"),
    );
    url.pathname = localizePath(locale, pathname);
  }
  return NextResponse.redirect(url);
}

// No `matcher`: the host check has to see every request, Server Actions included.
export function proxy(request: NextRequest) {
  const hostname = hostnameOf(request.headers.get("host") ?? "");
  if (!LOOPBACK.has(hostname) && !extraHosts.includes(hostname)) {
    return new NextResponse("This app only answers on localhost.", {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return withLanguage(request) ?? NextResponse.next();
}
