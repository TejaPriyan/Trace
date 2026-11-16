import assert from "node:assert/strict";
import dns from "node:dns";
import { EventEmitter } from "node:events";
import http from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, it, mock } from "node:test";
import zlib from "node:zlib";
import { extractPage } from "@/lib/trace/extract";
import { isAllowed, parseRobots } from "@/lib/trace/robots";
import { safeFetch } from "@/lib/trace/safe-fetch";
import { TraceError } from "@/lib/trace/security";

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

function mockPublicDns() {
  mock.method(dns, "lookup", ((
    _hostname: string,
    options: dns.LookupOptions | ((err: NodeJS.ErrnoException | null, addr: string | dns.LookupAddress[], fam?: number) => void),
    cb?: (err: NodeJS.ErrnoException | null, addr: string | dns.LookupAddress[], fam?: number) => void,
  ) => {
    const callback = typeof options === "function" ? options : cb!;
    const all = typeof options === "object" && options !== null && options.all;
    if (all) {
      callback(null, [{ address: "93.184.216.34", family: 4 }]);
    } else {
      callback(null, "93.184.216.34", 4);
    }
  }) as typeof dns.lookup);
}

afterEach(() => {
  mock.restoreAll();
});

describe("safeFetch, robots, and HTML extraction", () => {
  it("decompresses valid gzip payloads cleanly", async () => {
    mockPublicDns();
    const bodyText = "<html><title>Hello</title><body>World</body></html>";
    const gz = zlib.gzipSync(Buffer.from(bodyText));

    mock.method(http, "request", ((
      _opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const { stream, res } = makeMockResponse(200, { "content-type": "text/html", "content-encoding": "gzip" });
      queueMicrotask(() => {
        cb?.(res);
        stream.end(gz);
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    const r = await safeFetch("http://example.com/", { timeoutMs: 2000 });
    assert.equal(r.status, 200);
    assert.equal(r.truncated, false);
    assert.equal(r.body.toString("utf8"), bodyText);
  });

  it("rejects corrupted compressed payloads instead of resolving partial data and destroys decompressor", async () => {
    mockPublicDns();
    let capturedGunzip: zlib.Gunzip | null = null;
    const realCreateGunzip = zlib.createGunzip.bind(zlib);
    mock.method(zlib, "createGunzip", () => {
      capturedGunzip = realCreateGunzip();
      return capturedGunzip;
    });

    mock.method(http, "request", ((
      _opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const { stream, res } = makeMockResponse(200, { "content-type": "text/html", "content-encoding": "gzip" });
      queueMicrotask(() => {
        cb?.(res);
        stream.end(Buffer.from("not-valid-gzip-bytes"));
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    await assert.rejects(
      () => safeFetch("http://example.com/corrupt", { timeoutMs: 2000 }),
      (err: unknown) => err instanceof TraceError && err.code === "UNREACHABLE",
    );
    assert.ok(capturedGunzip);
    assert.equal((capturedGunzip as zlib.Gunzip).destroyed, true);
  });

  it("destroys piped zlib decompressor when maxBytes is exceeded", async () => {
    mockPublicDns();
    let capturedGunzip: zlib.Gunzip | null = null;
    const realCreateGunzip = zlib.createGunzip.bind(zlib);
    mock.method(zlib, "createGunzip", () => {
      capturedGunzip = realCreateGunzip();
      return capturedGunzip;
    });

    const largeText = "A".repeat(4096);
    const gz = zlib.gzipSync(Buffer.from(largeText));
    let capturedStream: PassThrough | null = null;

    mock.method(http, "request", ((
      _opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const { stream, res } = makeMockResponse(200, { "content-type": "text/html", "content-encoding": "gzip" });
      capturedStream = stream;
      queueMicrotask(() => {
        cb?.(res);
        stream.end(gz);
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    const res = await safeFetch("http://example.com/big", { timeoutMs: 2000, maxBytes: 128 });
    assert.equal(res.truncated, true);
    assert.equal(res.body.length, 128);
    assert.ok(capturedGunzip);
    assert.equal((capturedGunzip as zlib.Gunzip).destroyed, true);
    assert.equal(capturedStream!.destroyed, true);
  });

  it("destroys piped zlib decompressor and request on timeout", async () => {
    mockPublicDns();
    let capturedGunzip: zlib.Gunzip | null = null;
    const realCreateGunzip = zlib.createGunzip.bind(zlib);
    mock.method(zlib, "createGunzip", () => {
      capturedGunzip = realCreateGunzip();
      return capturedGunzip;
    });
    let capturedReq: FakeClientRequest | null = null;

    mock.method(http, "request", ((
      _opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      capturedReq = req;
      const { res } = makeMockResponse(200, { "content-type": "text/html", "content-encoding": "gzip" });
      queueMicrotask(() => {
        cb?.(res);
        // Never ends; triggers once() timeout
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    await assert.rejects(
      () => safeFetch("http://example.com/slow", { timeoutMs: 500 }),
      (err: unknown) => err instanceof TraceError && err.code === "TIMEOUT",
    );
    assert.ok(capturedGunzip);
    assert.equal((capturedGunzip as zlib.Gunzip).destroyed, true);
    assert.equal(capturedReq!.destroyed, true);
  });

  it("blocks redirects pointing to private/loopback addresses", async () => {
    mockPublicDns();
    mock.method(http, "request", ((
      _opts: http.RequestOptions,
      cb?: (res: http.IncomingMessage) => void,
    ) => {
      const req = new FakeClientRequest();
      const { stream, res } = makeMockResponse(302, { location: "http://127.0.0.1/internal" });
      queueMicrotask(() => {
        cb?.(res);
        stream.end();
      });
      return req as unknown as http.ClientRequest;
    }) as typeof http.request);

    await assert.rejects(
      () => safeFetch("http://example.com/redir", { timeoutMs: 2000 }),
      (err: unknown) => err instanceof TraceError && err.code === "BLOCKED",
    );
  });

  it("parses robots.txt groups, specificity, crawl-delay, and sitemaps", () => {
    const parsed = parseRobots(
      [
        "User-agent: *",
        "Disallow: /private/",
        "Allow: /private/public-page",
        "Crawl-delay: 2",
        "",
        "User-agent: TraceBot",
        "Disallow: /admin",
        "Allow: /admin/status",
        "Sitemap: https://example.com/sitemap.xml",
      ].join("\n"),
    );

    const info = { found: true, status: 200, ...parsed };
    assert.deepEqual(info.sitemaps, ["https://example.com/sitemap.xml"]);
    assert.equal(isAllowed(info, "/admin/users"), false);
    assert.equal(isAllowed(info, "/admin/status"), true);
    assert.equal(isAllowed(info, "/private/anything"), true);
  });

  it("extracts headings, semantic link areas, forms, and content word counts", () => {
    const html = `<!doctype html>
      <html lang="en">
        <head>
          <title>Example Page</title>
          <meta name="description" content="Sample description">
          <link rel="canonical" href="https://example.com/docs">
          <script type="application/ld+json">{"@type":"TechArticle"}</script>
        </head>
        <body>
          <header><nav><a href="/pricing">Pricing</a></nav></header>
          <main>
            <h1>Documentation</h1>
            <h2>Getting Started</h2>
            <p>Read the <a href="https://external.org/spec">specification</a> for detailed integration instructions and examples.</p>
            <form action="/subscribe" method="post">
              <label for="em">Email</label>
              <input id="em" type="email" name="email" />
              <button type="submit">Subscribe</button>
            </form>
          </main>
          <footer><a href="/privacy">Privacy</a></footer>
        </body>
      </html>`;

    const page = extractPage(html, {
      url: "https://example.com/docs",
      siteHost: "example.com",
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      depth: 1,
      parentUrl: "https://example.com/",
      responseMs: 42,
      htmlBytes: Buffer.byteLength(html),
      redirectedFrom: null,
      analyzeAssets: true,
    });

    assert.equal(page.title, "Example Page");
    assert.equal(page.description, "Sample description");
    assert.equal(page.canonical, "https://example.com/docs");
    assert.deepEqual(page.jsonLd, ["TechArticle"]);
    assert.equal(page.links.find((l) => l.url.endsWith("/pricing"))?.area, "nav");
    assert.equal(page.links.find((l) => l.url.endsWith("/privacy"))?.area, "footer");
    assert.equal(page.links.find((l) => l.url.includes("external.org"))?.internal, false);
    assert.equal(page.forms[0]?.labeled, 1);
    assert.ok(page.wordCount >= 10);
  });
});
