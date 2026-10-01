import { NextResponse } from "next/server";
import { clampSettings } from "@/lib/trace/limits";
import { acquireJob, checkRate, clientKey, releaseJob } from "@/lib/trace/rate-limit";
import { TraceError, assertPublicDns, parseUserUrl } from "@/lib/trace/security";
import { cleanupOld, findExisting, startTrace } from "@/lib/trace/store";
import { ERROR_COPY } from "@/lib/trace/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fail(code: keyof typeof ERROR_COPY, status: number, detail?: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message: ERROR_COPY[code], detail } }, { status, headers: extra as HeadersInit | undefined });
}

export async function POST(req: Request) {
  let body: { url?: unknown; settings?: unknown; force?: unknown };
  try {
    const raw = await req.text();
    if (raw.length > 10_000) return fail("INVALID_URL", 413);
    body = JSON.parse(raw);
  } catch {
    return fail("INVALID_URL", 400, "Malformed request");
  }
  if (typeof body.url !== "string") return fail("INVALID_URL", 400);
  const key = clientKey(req);

  let url: URL;
  try {
    url = parseUserUrl(body.url);
    await assertPublicDns(url.hostname);
  } catch (e) {
    if (e instanceof TraceError) {
      const status = e.code === "BLOCKED" ? 403 : e.code === "UNREACHABLE" ? 422 : 400;
      return fail(e.code === "UNREACHABLE" ? "UNREACHABLE" : e.code === "BLOCKED" ? "BLOCKED" : "INVALID_URL", status, e.message);
    }
    return fail("INTERNAL", 500);
  }

  if (body.force !== true) {
    try {
      const existing = await findExisting(url.href);
      if (existing) return NextResponse.json({ existing });
    } catch {}
  }

  const rate = checkRate(key);
  if (!rate.ok) return NextResponse.json({ error: { code: "RATE_LIMIT", message: ERROR_COPY.RATE_LIMIT, detail: `Retry in ${rate.retryAfterSec}s` } }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });

  const host = url.hostname.replace(/^www\./, "");
  const lock = acquireJob(key, host);
  if (!lock.ok) return NextResponse.json({ error: { code: "RATE_LIMIT", message: ERROR_COPY.RATE_LIMIT, detail: lock.reason } }, { status: 429 });

  try {
    void cleanupOld();
    const id = await startTrace({ url: url.href, settings: clampSettings(body.settings as never), limiterKey: key, host });
    return NextResponse.json({ id });
  } catch (e) {
    releaseJob(key, host);
    console.error("[trace] start failed", e);
    return fail("INTERNAL", 500);
  }
}
