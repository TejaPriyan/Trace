import { clampSettings } from "@/lib/trace/limits";
import { acquireJob, checkRate, clientKey, releaseJob } from "@/lib/trace/rate-limit";
import { TraceError, assertPublicDns, parseUserUrl } from "@/lib/trace/security";
import { executeTrace, findExisting, getTraceState, isTraceId } from "@/lib/trace/store";
import { ERROR_COPY, type Progress } from "@/lib/trace/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  const rawId = searchParams.get("id");

  if (!rawUrl) {
    return new Response(JSON.stringify({ error: { code: "INVALID_URL", message: "URL is required" } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let url: URL;
  try {
    url = parseUserUrl(rawUrl);
    await assertPublicDns(url.hostname);
  } catch (e) {
    const code = e instanceof TraceError ? e.code : "INVALID_URL";
    return new Response(JSON.stringify({ error: { code, message: ERROR_COPY[code] } }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const traceId = rawId && isTraceId(rawId) ? rawId : undefined;

  // Check if we already have a completed report for this ID
  if (traceId) {
    const existingState = await getTraceState(traceId);
    if (existingState.status === "complete") {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(`event: complete\ndata: ${JSON.stringify({ id: existingState.report.id, report: existingState.report })}\n\n`)
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }
  }

  const key = clientKey(req);
  const rate = checkRate(key);
  if (!rate.ok) {
    return new Response(JSON.stringify({ error: { code: "RATE_LIMIT", message: ERROR_COPY.RATE_LIMIT } }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(rate.retryAfterSec) },
    });
  }

  const host = url.hostname.replace(/^www\./, "");
  const lock = acquireJob(key, host);
  if (!lock.ok) {
    return new Response(JSON.stringify({ error: { code: "RATE_LIMIT", message: lock.reason } }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, payload: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch {}
      };

      try {
        const report = await executeTrace({
          id: traceId,
          url: url.href,
          settings: clampSettings(null),
          onProgress: (p: Progress) => {
            send("progress", p);
          },
        });
        send("complete", { id: report.id, report });
      } catch (e) {
        const code = e instanceof TraceError ? e.code : "INTERNAL";
        const message = e instanceof TraceError ? e.message : "Unexpected crawl error";
        send("error", { code, message: ERROR_COPY[code] ?? message, detail: message });
      } finally {
        releaseJob(key, host);
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
