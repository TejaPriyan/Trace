import "server-only";
import net from "node:net";
import dns from "node:dns";

export class TraceError extends Error {
  code: "INVALID_URL" | "BLOCKED" | "ROBOTS" | "TIMEOUT" | "UNREACHABLE" | "EMPTY" | "RATE_LIMIT" | "INTERNAL";
  constructor(code: TraceError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function parseV4(ip: string): number[] | null {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  const n = p.map((x) => Number(x));
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null;
  return n;
}

function isPrivateV4(a: number[]): boolean {
  const [o1, o2, o3] = a;
  return (
    o1 === 0 ||
    o1 === 10 ||
    o1 === 127 ||
    (o1 === 100 && o2 >= 64 && o2 <= 127) ||
    (o1 === 169 && o2 === 254) ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) ||
    (o1 === 192 && o2 === 0 && (o3 === 0 || o3 === 2)) ||
    (o1 === 192 && o2 === 168) ||
    (o1 === 198 && (o2 === 18 || o2 === 19)) ||
    (o1 === 198 && o2 === 51 && o3 === 100) ||
    (o1 === 203 && o2 === 0 && o3 === 113) ||
    o1 >= 224
  );
}

function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone >= 0) s = s.slice(0, zone);
  // embedded IPv4 tail
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseV4(tail);
    if (!v4) return null;
    s = s.slice(0, lastColon + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...rest] : head;
  const out = groups.map((g) => parseInt(g || "0", 16));
  if (out.length !== 8 || out.some((x) => !Number.isFinite(x) || x < 0 || x > 0xffff)) return null;
  return out;
}

/** Returns true when the address is not a safe, public, globally routable address. */
export function isPrivateIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) {
    const a = parseV4(ip);
    return !a || isPrivateV4(a);
  }
  if (v === 6) {
    const g = expandV6(ip);
    if (!g) return true;
    const allZeroPrefix = g.slice(0, 5).every((x) => x === 0);
    if (g.every((x) => x === 0)) return true; // ::
    if (allZeroPrefix && g[5] === 0xffff) return isPrivateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]); // ::ffff:v4
    if (g.slice(0, 6).every((x) => x === 0)) return true; // ::/96 deprecated v4-compatible (and ::1)
    if (g[0] === 0x64 && g[1] === 0xff9b) return isPrivateV4([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]); // NAT64
    if (g[0] === 0x2002) return isPrivateV4([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]); // 6to4
    if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
    if ((g[0] & 0xffc0) === 0xfe80) return true; // link-local
    if ((g[0] & 0xffc0) === 0xfec0) return true; // site-local
    if ((g[0] & 0xff00) === 0xff00) return true; // multicast
    if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
    if (g[0] === 0x2001 && g[1] === 0) return true; // teredo
    return false;
  }
  return true;
}

const BLOCKED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".lan",
  ".home",
  ".home.arpa",
  ".corp",
  ".intranet",
  ".private",
  ".test",
  ".invalid",
  ".onion",
];

/** Static (non-DNS) hostname check. Throws TraceError on anything not obviously public. */
export function assertPublicHostname(hostnameRaw: string): void {
  const hostname = hostnameRaw.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!hostname) throw new TraceError("INVALID_URL", "Missing hostname");
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new TraceError("BLOCKED", "Private or reserved IP addresses are not allowed");
    return;
  }
  if (hostname === "localhost" || BLOCKED_SUFFIXES.some((s) => hostname.endsWith(s))) {
    throw new TraceError("BLOCKED", "Internal hostnames are not allowed");
  }
  if (!hostname.includes(".")) throw new TraceError("BLOCKED", "Single-label (internal) hostnames are not allowed");
  if (!/^[a-z0-9.-]+$/.test(hostname)) throw new TraceError("INVALID_URL", "Hostname contains invalid characters");
  if (hostname.length > 253) throw new TraceError("INVALID_URL", "Hostname too long");
  // numeric-looking TLD (e.g. 1.2.3.4.5 or 0x7f.1) — obfuscated IP forms
  const tld = hostname.split(".").pop() ?? "";
  if (/^\d+$/.test(tld) || /^0x/i.test(tld)) throw new TraceError("BLOCKED", "Numeric hostnames are not allowed");
}

/** Resolve a hostname and verify every returned address is public. */
export async function assertPublicDns(hostnameRaw: string): Promise<void> {
  const hostname = hostnameRaw.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) return assertPublicHostname(hostname);
  let addrs: dns.LookupAddress[];
  try {
    addrs = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new TraceError("UNREACHABLE", "Hostname could not be resolved");
  }
  if (!addrs.length) throw new TraceError("UNREACHABLE", "Hostname could not be resolved");
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new TraceError("BLOCKED", "Hostname resolves to a private or internal address");
  }
}

const TRACKING = /^(utm_|fbclid$|gclid$|msclkid$|mc_cid$|mc_eid$|igshid$|_hsenc$|_hsmi$|yclid$)/i;

/** Parse + validate + normalize user input. Throws TraceError. */
export function parseUserUrl(input: string): URL {
  let raw = (input ?? "").trim();
  if (!raw || raw.length > 2048) throw new TraceError("INVALID_URL", "Empty or oversized URL");
  if (/[\s<>"'`]/.test(raw)) throw new TraceError("INVALID_URL", "URL contains illegal characters");
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(raw);
  if (scheme && !/^[a-z]+:\/\//i.test(raw) && !/^[^/]+:\d+(\/|$)/.test(raw)) {
    throw new TraceError("INVALID_URL", "Unsupported protocol");
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = "https://" + raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new TraceError("INVALID_URL", "Malformed URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new TraceError("INVALID_URL", "Only HTTP and HTTPS are supported");
  if (u.username || u.password) throw new TraceError("INVALID_URL", "URLs with credentials are not allowed");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new TraceError("BLOCKED", "Only standard web ports (80, 443) are allowed");
  assertPublicHostname(u.hostname);
  return normalizeUrl(u);
}

/** Normalize a URL: strip fragment + tracking params, sort query, drop trailing slash (except root). */
export function normalizeUrl(u: URL): URL {
  const n = new URL(u.href);
  n.hash = "";
  const params = [...n.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  params.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  n.search = "";
  for (const [k, v] of params) n.searchParams.append(k, v);
  if (n.pathname.length > 1 && n.pathname.endsWith("/")) n.pathname = n.pathname.replace(/\/+$/, "") || "/";
  n.pathname = n.pathname.replace(/\/{2,}/g, "/");
  return n;
}

export function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}
