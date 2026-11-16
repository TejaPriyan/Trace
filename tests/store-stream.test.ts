import assert from "node:assert/strict";
import dns from "node:dns";
import { EventEmitter } from "node:events";
import http from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, it, mock } from "node:test";
import { GET as streamGET } from "@/app/api/trace/stream/route";
import { LIMITS, clampSettings } from "@/lib/trace/limits";
import { acquireJob, releaseJob } from "@/lib/trace/rate-limit";
import {
  cleanupOld,
  evictMemoryCache,
  findExisting,
  getMemoryReport,
  getTraceState,
  saveReportInMemory,
  startTrace,
} from "@/lib/trace/store";
import type { TraceReport } from "@/lib/trace/types";

class FakeClientRequest extends EventEmitter {
  destroyed = false;
  destroy() {
    this.destroyed = true;
    return this;
  }
  end() {
    return this;
  }
}

function makeMockResponse(statusCode: number, headers: Record<string, string>) {
  const stream = new PassThrough();
  const res = stream as unknown as http.IncomingMessage;
  res.statusCode = statusCode;
  res.headers = headers;
  return { stream, res };
}

function makeReport(id: string, url: string, createdAt: string): TraceReport {
  return {
    id,
    demo: false,
    url,
    hostname: new URL(url).hostname,
    createdAt,
    durationMs: 100,
    settings: clampSettings(null),
    policy: {
      robotsFound: false,
      robotsStatus: 404,
      sitemaps: [],
      sitemapUrlCount: null,
      crawlDelaySec: null,
      disallowRules: 0,
      blockedPaths: [],
      summary: "No robots.txt found",
    },
    notes: {
      requestedPages: 1,
      analyzedPages: 1,
      partial: false,
      stopReason: null,
      jsShellPages: 0,
      jsRenderingNote: null,
      errors: [],
      unvisitedCount: 0,
      sitemapNotCrawled: [],
    },
    identity: { title: "Test", description: null, canonical: null, lang: "en", favicon: null, og: {}, twitter: {} },
    stats: {
      pages: 1,
      sections: 1,
      internalLinks: 0,
      externalLinks: 0,
      assets: 0,
      forms: 0,
      techSignals: 0,
      journeys: 0,
      findings: 0,
      brokenPages: 0,
      maxDepth: 0,
      externalDomains: 0,
      claims: 0,
      resources: 0,
    },
    pages: [],
    sections: [],
    graph: { nodes: [], edges: [] },
    technologies: [],
    content: {
      typeCounts: [],
      totalWords: 0,
      avgWords: 0,
      thinPages: [],
      images: 0,
      videos: 0,
      audios: 0,
      iframes: 0,
      ctas: [],
      nav: [],
      repeated: [],
      headingSamples: [],
    },
    seo: { key: "seo", label: "SEO SIGNALS", note: "", checks: [], metrics: [] },
    a11y: { key: "a11y", label: "ACCESSIBILITY SIGNALS", note: "", checks: [], metrics: [] },
    perf: { key: "perf", label: "PERFORMANCE SIGNALS", note: "", checks: [], metrics: [] },
    scores: [],
    findings: [],
    missed: [],
    journeys: [],
    claims: [],
    sources: [],
    assets: [],
    forms: [],
    resources: [],
  };
}

function mockPublicDnsAll() {
  mock.method(dns.promises, "lookup", async () => [{ address: "93.184.216.34", family: 4 }]);
  mock.method(dns, "lookup", ((
    _hostname: string,
    options: dns.LookupOptions | ((err: NodeJS.ErrnoException | null, addr: string | dns.LookupAddress[], fam?: number) => void),
    cb?: (err: NodeJS.ErrnoException | null, addr: string | dns.LookupAddress[], fam?: number) => void,
  ) => {
    const callback = typeof options === "function" ? options : cb!;
    const all = typeof options === "object" && options !== null && options.all;
    if (all) callback(null, [{ address: "93.184.216.34", family: 4 }]);
    else callback(null, "93.184.216.34", 4);
  }) as typeof dns.lookup);
}

function parseSse(text: string): { event: string; data: Record<string, unknown> }[] {
  const out: { event: string; data: Record<string, unknown> }[] = [];
  for (const chunk of text.split("\n\n")) {
    if (!chunk.trim()) continue;
    const ev = chunk.match(/^event:\s*(.+)$/m)?.[1];
    const d = chunk.match(/^data:\s*(.+)$/m)?.[1];
    if (ev && d) out.push({ event: ev, data: JSON.parse(d) as Record<string, unknown> });
  }
  return out;
}

afterEach(() => {
  mock.restoreAll();
});

describe("store cache eviction, dedupe, and stream route", () => {
  it("evicts expired memoryReports and memoryWebsites using retention and TTL bounds", async () => {
    const now = Date.now();
    const expiredReport = makeReport("TRC-EXP00001", "http://expired-site.example/", new Date(now - LIMITS.RETENTION_MS - 5000).toISOString());
    saveReportInMemory(expiredReport, now);
    assert.equal(getMemoryReport("TRC-EXP00001", now), undefined);
    assert.equal(await findExisting("http://expired-site.example/"), null);

    const staleCacheReport = makeReport("TRC-MID00002", "http://mid-age.example/", new Date(now - LIMITS.CACHE_TTL_MS - 5000).toISOString());
    saveReportInMemory(staleCacheReport, now);
    assert.ok(getMemoryReport("TRC-MID00002", now));
    assert.equal(await findExisting("http://mid-age.example/"), null);

    const freshReport = makeReport("TRC-FRESH003", "http://fresh-site.example/", new Date(now).toISOString());
    saveReportInMemory(freshReport, now);
    const hit = await findExisting("http://fresh-site.example/");
    assert.equal(hit?.id, "TRC-FRESH003");

    evictMemoryCache(now + LIMITS.CACHE_TTL_MS + 1000);
    assert.equal(await findExisting("http://fresh-site.example/"), null);
    assert.ok(getMemoryReport("TRC-FRESH003", now + LIMITS.CACHE_TTL_MS + 1000));

    await cleanupOld(now + LIMITS.RETENTION_MS + 1000);
    assert.equal(getMemoryReport("TRC-FRESH003", now + LIMITS.RETENTION_MS + 1000), undefined);
  });

  it("does not cache failed or in-flight traces in memoryWebsites and attaches stream cleanly without duplicate crawl", async () => {
    mockPublicDnsAll();
    let releaseStartPage: (() => void) | null = null;
    let startPageFetches = 0;

    mock.method(http, "request", ((
      opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const path = String(opts.path ?? "/");
      if (path === "/robots.txt" || path === "/sitemap.xml" || path === "/favicon.ico") {
        const { stream, res } = makeMockResponse(404, { "content-type": "text/plain" });
        queueMicrotask(() => {
          cb?.(res);
          stream.end();
        });
      } else {
        startPageFetches++;
        const { stream, res } = makeMockResponse(200, { "content-type": "text/html" });
        const sendBody = () => {
          cb?.(res);
          stream.end("<html><head><title>Attached Site</title></head><body><main><h1>Attached</h1><p>Content ready.</p></main></body></html>");
        };
        if (startPageFetches === 1) {
          releaseStartPage = sendBody;
        } else {
          queueMicrotask(sendBody);
        }
      }
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    const limiterKey = "198.51.100.42";
    const host = "attach-demo.example";
    const lock = acquireJob(limiterKey, host);
    assert.equal(lock.ok, true);

    const id = await startTrace({
      url: "http://attach-demo.example/",
      settings: clampSettings({ maxPages: 1 }),
      limiterKey,
      host,
    });

    // While in-flight, findExisting must NOT return the running trace ID
    assert.equal(await findExisting("http://attach-demo.example/"), null);
    const runningState = await getTraceState(id);
    assert.equal(runningState.status, "running");

    // Hitting /api/trace/stream for the running traceId must attach cleanly without spawning a duplicate crawl or 429
    const streamRes = await streamGET(new Request(`http://localhost/api/trace/stream?id=${id}&url=${encodeURIComponent("http://attach-demo.example/")}`));
    assert.equal(streamRes.status, 200);
    assert.equal(streamRes.headers.get("content-type"), "text/event-stream; charset=utf-8");

    // Let the paused start-page fetch proceed
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(releaseStartPage);
    (releaseStartPage as () => void)();

    const sseBody = await streamRes.text();
    const events = parseSse(sseBody);
    assert.ok(events.some((e) => e.event === "progress"));
    const doneEvent = events.find((e) => e.event === "complete");
    assert.ok(doneEvent);
    assert.equal(doneEvent.data.id, id);
    assert.equal(startPageFetches, 1);

    // Completed trace is now discoverable via findExisting
    const existing = await findExisting("http://attach-demo.example/");
    assert.equal(existing?.id, id);

    // Failed trace must not populate findExisting
    mock.restoreAll();
    mockPublicDnsAll();
    mock.method(http, "request", ((
      opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const { stream, res } = makeMockResponse(opts.path === "/robots.txt" ? 404 : 403, { "content-type": "text/html" });
      queueMicrotask(() => {
        cb?.(res);
        stream.end("Forbidden");
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    const failLock = acquireJob(limiterKey, "fail-demo.example");
    assert.equal(failLock.ok, true);
    const failId = await startTrace({
      url: "http://fail-demo.example/",
      settings: clampSettings({ maxPages: 1 }),
      limiterKey,
      host: "fail-demo.example",
    });
    for (let i = 0; i < 40; i++) {
      const st = await getTraceState(failId);
      if (st.status === "failed") break;
      await new Promise((r) => setTimeout(r, 15));
    }
    assert.equal((await getTraceState(failId)).status, "failed");
    assert.equal(await findExisting("http://fail-demo.example/"), null);
    releaseJob(limiterKey, "fail-demo.example");
  });

  it("propagates validated crawl settings on GET /api/trace/stream fallback", async () => {
    mockPublicDnsAll();
    mock.method(http, "request", ((
      opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const isAux = opts.path === "/robots.txt" || opts.path === "/sitemap.xml" || opts.path === "/favicon.ico";
      const { stream, res } = makeMockResponse(isAux ? 404 : 200, { "content-type": isAux ? "text/plain" : "text/html" });
      queueMicrotask(() => {
        cb?.(res);
        stream.end("<html><head><title>Settings</title></head><body><main><h1>Settings</h1><p>Testing settings propagation.</p></main></body></html>");
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    const res = await streamGET(
      new Request(
        "http://localhost/api/trace/stream?url=http://settings-test.example/&maxPages=99&maxDepth=6&timeoutSec=22&jsRendering=off&analyzeAssets=false",
      ),
    );
    assert.equal(res.status, 200);
    const events = parseSse(await res.text());
    const done = events.find((e) => e.event === "complete");
    assert.ok(done);
    const report = done.data.report as TraceReport;
    assert.deepEqual(report.settings, {
      maxPages: 99,
      maxDepth: 6,
      timeoutSec: 22,
      jsRendering: "off",
      analyzeAssets: false,
    });
  });

  it("streams stored complete/failed states without re-crawling and blocks SSRF targets", async () => {
    mockPublicDnsAll();
    const completed = makeReport("TRC-DONE0004", "http://cached-complete.example/", new Date().toISOString());
    saveReportInMemory(completed);

    let fetchCount = 0;
    mock.method(http, "request", (() => {
      fetchCount++;
      return new FakeClientRequest() as unknown as http.ClientRequest;
    }) as typeof http.request);

    const completeRes = await streamGET(
      new Request("http://localhost/api/trace/stream?id=TRC-DONE0004&url=http://cached-complete.example/"),
    );
    assert.equal(completeRes.status, 200);
    const completeEvents = parseSse(await completeRes.text());
    assert.equal(completeEvents[0]?.event, "complete");
    assert.equal(completeEvents[0]?.data.id, "TRC-DONE0004");
    assert.equal(fetchCount, 0);

    const ssrfRes = await streamGET(new Request("http://localhost/api/trace/stream?url=http://127.0.0.1/admin"));
    assert.equal(ssrfRes.status, 400);
    const ssrfJson = (await ssrfRes.json()) as { error?: { code?: string } };
    assert.equal(ssrfJson.error?.code, "BLOCKED");
  });
});
