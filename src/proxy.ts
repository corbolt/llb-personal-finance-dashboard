import { NextResponse, type NextRequest } from "next/server";

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

export function proxy(request: NextRequest) {
  const hostname = hostnameOf(request.headers.get("host") ?? "");
  if (LOOPBACK.has(hostname) || extraHosts.includes(hostname)) return NextResponse.next();
  return new NextResponse("This app only answers on localhost.", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
