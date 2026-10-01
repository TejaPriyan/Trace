import "server-only";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import { LIMITS } from "./limits";
import { TraceError, assertPublicHostname, isPrivateIp } from "./security";

export const USER_AGENT = "TraceBot/1.0 (+public website structure analysis; respects robots.txt)";

export interface SafeResponse {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
  skippedBody: boolean;
  ms: number;
  redirects: string[];
}

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes?: number;
  accept?: string;
  /** Return false to skip downloading the body (e.g. non-HTML content). */
  bodyFilter?: (headers: Record<string, string>) => boolean;
}

/**
 * DNS lookup used for the actual socket connection. Validating here (not just before the request)
 * closes the DNS-rebinding window: the address we validate is the address we connect to.
 */
const safeLookup = ((
  hostname: string,
  options: dns.LookupOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void,
) => {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return callback(err, "", 4);
    if (!addrs.length) return callback(new Error("ENOTFOUND") as NodeJS.ErrnoException, "", 4);
    if (addrs.some((a) => isPrivateIp(a.address))) {
      return callback(new Error("BLOCKED_ADDRESS") as NodeJS.ErrnoException, "", 4);
    }
    if (options.all) return callback(null, addrs);
    callback(null, addrs[0].address, addrs[0].family);
  });
}) as unknown as net_LookupFunction;

type net_LookupFunction = NonNullable<http.RequestOptions["lookup"]>;

function flattenHeaders(h: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
  }
  return out;
}

function once(
  target: URL,
  opts: SafeFetchOptions,
  deadline: number,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer; truncated: boolean; skippedBody: boolean }> {
  const maxBytes = Math.min(opts.maxBytes ?? LIMITS.MAX_RESPONSE_BYTES, LIMITS.MAX_RESPONSE_BYTES);
  return new Promise((resolve, reject) => {
    const lib = target.protocol === "https:" ? https : http;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const remaining = Math.max(500, deadline - Date.now());
    const timer = setTimeout(() => {
      req.destroy();
      finish(() => reject(new TraceError("TIMEOUT", "Request timed out")));
    }, remaining);

    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname.replace(/^\[|\]$/g, ""),
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: target.pathname + target.search,
        method: "GET",
        lookup: safeLookup,
        headers: {
          "user-agent": USER_AGENT,
          accept: opts.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en",
        },
      },
      (res) => {
        const headers = flattenHeaders(res.headers);
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && headers.location) {
          res.resume();
          return finish(() => resolve({ status, headers, body: Buffer.alloc(0), truncated: false, skippedBody: true }));
        }
        if (opts.bodyFilter && !opts.bodyFilter(headers)) {
          res.destroy();
          return finish(() => resolve({ status, headers, body: Buffer.alloc(0), truncated: false, skippedBody: true }));
        }
        let stream: NodeJS.ReadableStream = res;
        const enc = (headers["content-encoding"] || "").toLowerCase();
        if (enc.includes("gzip")) stream = res.pipe(zlib.createGunzip());
        else if (enc.includes("deflate")) stream = res.pipe(zlib.createInflate());
        else if (enc.includes("br")) stream = res.pipe(zlib.createBrotliDecompress());
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        stream.on("data", (c: Buffer) => {
          if (truncated) return;
          size += c.length;
          if (size > maxBytes) {
            truncated = true;
            chunks.push(c.subarray(0, c.length - (size - maxBytes)));
            res.destroy();
            return finish(() => resolve({ status, headers, body: Buffer.concat(chunks), truncated: true, skippedBody: false }));
          }
          chunks.push(c);
        });
        stream.on("end", () => finish(() => resolve({ status, headers, body: Buffer.concat(chunks), truncated, skippedBody: false })));
        stream.on("error", () => finish(() => resolve({ status, headers, body: Buffer.concat(chunks), truncated, skippedBody: false })));
        res.on("error", () => finish(() => resolve({ status, headers, body: Buffer.concat(chunks), truncated, skippedBody: false })));
      },
    );
    req.on("error", (e: NodeJS.ErrnoException) => {
      finish(() => {
        if (e.message === "BLOCKED_ADDRESS") return reject(new TraceError("BLOCKED", "Destination resolves to a private address"));
        if (e.code === "ENOTFOUND" || e.code === "EAI_AGAIN") return reject(new TraceError("UNREACHABLE", "Hostname could not be resolved"));
        if (e.code === "ETIMEDOUT") return reject(new TraceError("TIMEOUT", "Connection timed out"));
        reject(new TraceError("UNREACHABLE", e.code ? `Connection failed (${e.code})` : "Connection failed"));
      });
    });
    req.end();
  });
}

/**
 * GET a public URL with manual redirect handling. Every hop is re-validated
 * (protocol, port, hostname, DNS/IP) before any connection is made.
 */
export async function safeFetch(startUrl: string, opts: SafeFetchOptions): Promise<SafeResponse> {
  const started = Date.now();
  const deadline = started + opts.timeoutMs;
  let current = new URL(startUrl);
  const redirects: string[] = [];
  for (let hop = 0; hop <= LIMITS.MAX_REDIRECTS; hop++) {
    if (current.protocol !== "http:" && current.protocol !== "https:") throw new TraceError("BLOCKED", "Unsupported redirect protocol");
    const port = current.port ? Number(current.port) : current.protocol === "https:" ? 443 : 80;
    if (port !== 80 && port !== 443) throw new TraceError("BLOCKED", "Redirect to a non-standard port was blocked");
    if (current.username || current.password) throw new TraceError("BLOCKED", "Redirect with credentials was blocked");
    assertPublicHostname(current.hostname);
    const r = await once(current, opts, deadline);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      let next: URL;
      try {
        next = new URL(r.headers.location, current);
      } catch {
        throw new TraceError("UNREACHABLE", "Invalid redirect target");
      }
      redirects.push(next.href);
      current = next;
      continue;
    }
    return { url: current.href, status: r.status, headers: r.headers, body: r.body, truncated: r.truncated, skippedBody: r.skippedBody, ms: Date.now() - started, redirects };
  }
  throw new TraceError("UNREACHABLE", "Too many redirects");
}
