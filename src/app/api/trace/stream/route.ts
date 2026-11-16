import { parseSettingsParams } from "@/lib/trace/limits";
import { acquireJob, checkRate, clientKey, releaseJob } from "@/lib/trace/rate-limit";
import { TraceError, assertPublicDns, parseUserUrl } from "@/lib/trace/security";
import { executeTrace, getTraceState, isTraceId, subscribeTrace } from "@/lib/trace/store";
import { ERROR_COPY, type ErrorCode, type Progress } from "@/lib/trace/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
} as const;

function sseSingle(event: string, payload: unknown): Response {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

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
  const settings = parseSettingsParams(searchParams);

  if (traceId) {
    const existingState = await getTraceState(traceId);
    if (existingState.status === "complete") {
      return sseSingle("complete", { id: existingState.report.id, report: existingState.report });
    }
    if (existingState.status === "failed") {
      const code = existingState.error.code as ErrorCode;
      return sseSingle("error", {
        code: existingState.error.code,
        message: ERROR_COPY[code] ?? existingState.error.message,
        detail: existingState.error.message,
      });
    }
    if (existingState.status === "running") {
      let unsubscribe: (() => void) | null = null;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let closed = false;
          const close = () => {
            if (closed) return;
            closed = true;
            unsubscribe?.();
            unsubscribe = null;
            try {
              controller.close();
            } catch {}
          };
          const send = (event: string, payload: unknown) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));
            } catch {
              close();
            }
          };
          req.signal?.addEventListener("abort", close, { once: true });
          unsubscribe = subscribeTrace(traceId, (ev) => {
            if (ev.type === "progress") {
              send("progress", ev.progress);
            } else if (ev.type === "complete") {
              send("complete", { id: ev.report.id, report: ev.report });
              close();
            } else if (ev.type === "error") {
              send("error", {
                code: ev.error.code,
                message: ERROR_COPY[ev.error.code] ?? ev.error.message,
                detail: ev.error.message,
              });
              close();
            }
          });
          if (!unsubscribe) {
            void getTraceState(traceId).then((s) => {
              if (s.status === "complete") {
                send("complete", { id: s.report.id, report: s.report });
              } else if (s.status === "failed") {
                const code = s.error.code as ErrorCode;
                send("error", { code: s.error.code, message: ERROR_COPY[code] ?? s.error.message, detail: s.error.message });
              } else {
                send("error", { code: "INTERNAL", message: ERROR_COPY.INTERNAL });
              }
              close();
            });
          }
        },
        cancel() {
          unsubscribe?.();
          unsubscribe = null;
        },
      });
      return new Response(stream, { headers: SSE_HEADERS });
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
          settings,
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

  return new Response(stream, { headers: SSE_HEADERS });
}
