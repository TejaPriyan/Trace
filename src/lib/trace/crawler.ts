import "server-only";
import type { CrawlLogEntry, CrawlNotes, CrawlPolicy, CrawlSettings, PageData } from "./types";
import { LIMITS } from "./limits";
import { TraceError, assertPublicDns, normalizeUrl, siteKey } from "./security";
import { safeFetch } from "./safe-fetch";
import { fetchRobots, isAllowed, type RobotsInfo } from "./robots";
import { emptyPage, extractPage, isLikelyPageUrl } from "./extract";

export interface CrawlHooks {
  onPhase: (phase: "connecting" | "discovering" | "crawling", message?: string) => void;
  onUpdate: (u: { discovered: number; analyzed: number; queued: number; depth: number; externalDomains: number; log: CrawlLogEntry }) => void;
  onRobots: (summary: string) => void;
}

export interface CrawlResult {
  startUrl: string;
  siteHost: string;
  pages: PageData[];
  policy: CrawlPolicy;
  notes: CrawlNotes;
  favicon: { url: string; accessible: boolean | null } | null;
  durationMs: number;
}

const keyOf = (u: URL) => siteKey(u.hostname) + u.pathname + u.search;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isHtml = (h: Record<string, string>) => {
  const ct = (h["content-type"] || "").toLowerCase();
  return !ct || ct.includes("html") || ct.includes("xhtml");
};

function classifyFailure(e: unknown): { code: string; message: string } {
  if (e instanceof TraceError) return { code: e.code, message: e.message };
  return { code: "UNREACHABLE", message: "Request failed" };
}

async function loadSitemap(urls: string[], timeoutMs: number, host: string): Promise<{ count: number | null; urls: string[] }> {
  const found: string[] = [];
  let total: number | null = null;
  const queue = [...urls].slice(0, 3);
  let fetched = 0;
  while (queue.length && fetched < 4) {
    const sm = queue.shift()!;
    fetched++;
    try {
      const r = await safeFetch(sm, { timeoutMs, maxBytes: 3 * 1024 * 1024, accept: "application/xml,text/xml,*/*;q=0.5", bodyFilter: (h) => !/text\/html/i.test(h["content-type"] || "") });
      if (r.status !== 200 || r.skippedBody) continue;
      const xml = r.body.toString("utf8");
      const locs = [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((m) => m[1]);
      if (/<sitemapindex/i.test(xml)) {
        for (const l of locs.slice(0, 2)) queue.push(l);
        total = (total ?? 0);
      } else {
        total = (total ?? 0) + locs.length;
        for (const l of locs) {
          try {
            const u = new URL(l);
            if (siteKey(u.hostname) === siteKey(host) && found.length < 400) found.push(normalizeUrl(u).href);
          } catch {}
        }
      }
    } catch {}
  }
  return { count: total, urls: found };
}

export async function crawlSite(startUrl: string, settings: CrawlSettings, hooks: CrawlHooks): Promise<CrawlResult> {
  const t0 = Date.now();
  const timeoutMs = settings.timeoutSec * 1000;
  hooks.onPhase("connecting", "Validating destination");
  const start = new URL(startUrl);
  await assertPublicDns(start.hostname);

  // robots.txt (per origin)
  const robotsCache = new Map<string, RobotsInfo>();
  const getRobots = async (u: URL) => {
    let r = robotsCache.get(u.origin);
    if (!r) {
      r = await fetchRobots(u.origin, timeoutMs);
      robotsCache.set(u.origin, r);
    }
    return r;
  };
  hooks.onPhase("connecting", "Reading robots.txt");
  let robots = await getRobots(start);
  hooks.onRobots(robots.found ? "robots.txt detected." : "No robots.txt found.");

  // Homepage
  hooks.onPhase("discovering", "Fetching the start page");
  const pages: PageData[] = [];
  const errors: { url: string; error: string }[] = [];
  const blocked: string[] = [];
  const visited = new Set<string>();
  const fetchedKeys = new Set<string>();
  const queryVariants = new Map<string, number>();
  const extDomains = new Set<string>();
  let siteHost = start.hostname;

  if (!isAllowed(robots, start.pathname + start.search)) {
    throw new TraceError("ROBOTS", "robots.txt disallows the start URL");
  }

  type Item = { url: URL; depth: number; parent: string | null };
  const queue: Item[] = [{ url: start, depth: 0, parent: null }];
  visited.add(keyOf(start));
  let maxDepthSeen = 0;
  let active = 0;
  let attempts = 0;
  let stopReason: string | null = null;
  let nextSlot = 0;
  const delayMs = () => Math.min(LIMITS.MAX_CRAWL_DELAY_MS, Math.max(LIMITS.REQUEST_DELAY_MS, (robots.crawlDelaySec ?? 0) * 1000));
  const takeSlot = async () => {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + delayMs();
    if (at > now) await sleep(at - now);
  };

  const emit = (log: CrawlLogEntry) =>
    hooks.onUpdate({ discovered: visited.size, analyzed: pages.length, queued: queue.length, depth: maxDepthSeen, externalDomains: extDomains.size, log });

  let faviconCandidate: string | null = null;

  const processItem = async (item: Item) => {
    const u = item.url;
    const path = u.pathname + u.search;
    if (item.depth > 0 && !isAllowed(robots, path)) {
      blocked.push(path);
      emit({ path, state: "blocked" });
      return;
    }
    emit({ path, state: "active" });
    await takeSlot();
    try {
      const r = await safeFetch(u.href, { timeoutMs, maxBytes: LIMITS.MAX_RESPONSE_BYTES, bodyFilter: isHtml });
      const finalUrl = normalizeUrl(new URL(r.url));
      if (item.depth === 0) {
        siteHost = finalUrl.hostname;
        if (finalUrl.origin !== start.origin) {
          robots = await getRobots(finalUrl);
          hooks.onRobots(robots.found ? "robots.txt detected." : "No robots.txt found.");
          if (!isAllowed(robots, finalUrl.pathname + finalUrl.search)) throw new TraceError("ROBOTS", "robots.txt disallows the start URL");
        }
      }
      const fk = keyOf(finalUrl);
      if (item.depth > 0 && fk !== keyOf(u) && fetchedKeys.has(fk)) return; // redirect landed on an already analyzed page
      fetchedKeys.add(fk);
      visited.add(fk);
      const redirectedFrom = r.redirects.length ? u.href : null;
      if (r.skippedBody) {
        if (item.depth === 0) throw new TraceError(r.status >= 400 ? "BLOCKED" : "EMPTY", "Start page is not an HTML document");
        if (r.status >= 400) {
          pages.push(emptyPage(finalUrl.href, item.depth, item.parent, { status: r.status, responseMs: r.ms, contentType: r.headers["content-type"] ?? null, redirectedFrom }));
          emit({ path, state: "error", code: r.status, ms: r.ms });
        }
        return; // non-HTML resource: not a page
      }
      if (r.status >= 400) {
        if (item.depth === 0) {
          if ([401, 403, 429, 451, 503].includes(r.status)) throw new TraceError("BLOCKED", `Start page returned HTTP ${r.status}`);
          throw new TraceError("UNREACHABLE", `Start page returned HTTP ${r.status}`);
        }
        pages.push(emptyPage(finalUrl.href, item.depth, item.parent, { status: r.status, responseMs: r.ms, contentType: r.headers["content-type"] ?? null, redirectedFrom }));
        emit({ path, state: "error", code: r.status, ms: r.ms });
        return;
      }
      const html = r.body.toString("utf8");
      const page = extractPage(html, {
        url: finalUrl.href,
        siteHost,
        status: r.status,
        headers: r.headers,
        depth: item.depth,
        parentUrl: item.parent,
        responseMs: r.ms,
        htmlBytes: r.body.length,
        redirectedFrom,
        analyzeAssets: settings.analyzeAssets,
      });
      if (r.truncated) page.error = "Response exceeded the size limit and was truncated";
      pages.push(page);
      maxDepthSeen = Math.max(maxDepthSeen, item.depth);
      if (item.depth === 0) faviconCandidate = page.favicon;
      for (const l of page.links) {
        let lu: URL;
        try {
          lu = new URL(l.url);
        } catch {
          continue;
        }
        if (!l.internal) {
          extDomains.add(siteKey(lu.hostname));
          continue;
        }
        if (item.depth + 1 > settings.maxDepth || !isLikelyPageUrl(lu)) continue;
        const nu = normalizeUrl(lu);
        const k = keyOf(nu);
        if (visited.has(k)) continue;
        if (nu.search) {
          const pk = siteKey(nu.hostname) + nu.pathname;
          const c = queryVariants.get(pk) ?? 0;
          if (c >= LIMITS.MAX_QUERY_VARIANTS_PER_PATH) continue;
          queryVariants.set(pk, c + 1);
        }
        visited.add(k);
        queue.push({ url: nu, depth: item.depth + 1, parent: finalUrl.href });
      }
      for (const s of [...page.scripts.map((x) => x.src), ...page.styles.map((x) => x.href)]) {
        if (!s) continue;
        try {
          const h = siteKey(new URL(s).hostname);
          if (h !== siteKey(siteHost)) extDomains.add(h);
        } catch {}
      }
      emit({ path, state: "ok", code: r.status, ms: r.ms });
    } catch (e) {
      if (item.depth === 0) throw e;
      const f = classifyFailure(e);
      errors.push({ url: u.href, error: f.message });
      pages.push(emptyPage(u.href, item.depth, item.parent, { error: f.message }));
      emit({ path, state: "error", code: null });
    }
  };

  // Start page first (alone) — a failure here is fatal and must be surfaced.
  attempts++;
  await processItem(queue.shift()!);
  if (!pages.length) throw new TraceError("EMPTY", "No usable public pages were discovered");

  hooks.onPhase("crawling", "Following internal links");
  const failures: unknown[] = [];
  await new Promise<void>((resolveAll) => {
    const pump = () => {
      if (Date.now() - t0 > LIMITS.MAX_CRAWL_MS && !stopReason) stopReason = "Crawl time limit reached";
      while (active < LIMITS.MAX_CONCURRENT_REQUESTS && queue.length && attempts < settings.maxPages && !stopReason) {
        const item = queue.shift()!;
        attempts++;
        active++;
        processItem(item)
          .catch((e) => failures.push(e))
          .finally(() => {
            active--;
            pump();
          });
      }
      if (active === 0 && (queue.length === 0 || attempts >= settings.maxPages || stopReason)) resolveAll();
    };
    pump();
  });

  if (!stopReason && queue.length > 0 && attempts >= settings.maxPages) stopReason = `Page limit reached (${settings.maxPages})`;

  // Sitemap + favicon (best effort)
  const sitemapCandidates = robots.sitemaps.length ? robots.sitemaps : [new URL("/sitemap.xml", start.origin).href];
  let sitemap: { count: number | null; urls: string[] } = { count: null, urls: [] };
  try {
    sitemap = await loadSitemap(sitemapCandidates, timeoutMs, siteHost);
  } catch {}
  let favicon: CrawlResult["favicon"] = null;
  try {
    const favUrl = faviconCandidate ?? new URL("/favicon.ico", start.origin).href;
    const fr = await safeFetch(favUrl, { timeoutMs: Math.min(timeoutMs, 5000), maxBytes: 64 * 1024, accept: "image/*,*/*;q=0.5", bodyFilter: (h) => /image|icon|octet/i.test(h["content-type"] || "") });
    favicon = { url: favUrl, accessible: fr.status >= 200 && fr.status < 300 && !fr.skippedBody };
    if (!faviconCandidate && !favicon.accessible) favicon = null;
  } catch {
    favicon = faviconCandidate ? { url: faviconCandidate, accessible: null } : null;
  }

  const analyzedKeys = new Set(pages.map((p) => keyOf(new URL(p.url))));
  const sitemapNotCrawled = sitemap.urls.filter((u) => {
    try {
      return !analyzedKeys.has(keyOf(new URL(u)));
    } catch {
      return false;
    }
  });
  const jsShellPages = pages.filter((p) => p.jsShell).length;
  const policy: CrawlPolicy = {
    robotsFound: robots.found,
    robotsStatus: robots.status,
    sitemaps: robots.sitemaps.slice(0, 5),
    sitemapUrlCount: sitemap.count,
    crawlDelaySec: robots.crawlDelaySec,
    disallowRules: robots.disallowCount,
    blockedPaths: blocked.slice(0, 50),
    summary: robots.found
      ? `robots.txt detected with ${robots.disallowCount} disallow rule${robots.disallowCount === 1 ? "" : "s"} applying to TraceBot. ${blocked.length ? `${blocked.length} discovered URL${blocked.length === 1 ? " was" : "s were"} skipped.` : "No discovered URLs were skipped."}`
      : `No robots.txt found${robots.status ? ` (HTTP ${robots.status})` : ""}.`,
  };
  const notes: CrawlNotes = {
    requestedPages: settings.maxPages,
    analyzedPages: pages.length,
    partial: !!stopReason,
    stopReason,
    jsShellPages,
    jsRenderingNote:
      jsShellPages > 0
        ? settings.jsRendering === "off"
          ? `${jsShellPages} page(s) appear to require JavaScript rendering. JavaScript rendering was turned off for this trace.`
          : `${jsShellPages} page(s) appear to require browser rendering. Browser rendering is not available on this TRACE server, so only server-delivered HTML was analyzed for them.`
        : null,
    errors: errors.slice(0, 30),
    unvisitedCount: queue.length,
    sitemapNotCrawled: sitemapNotCrawled.slice(0, 50),
  };
  return { startUrl: start.href, siteHost, pages, policy, notes, favicon, durationMs: Date.now() - t0 };
}
