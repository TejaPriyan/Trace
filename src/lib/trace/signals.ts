import type { Check, CheckStatus, CrawlNotes, CrawlPolicy, PageReport, ScoreBreakdown, ScoreItem, SignalGroup } from "./types";

export const isOkPage = (p: PageReport) => p.status !== null && p.status >= 200 && p.status < 400;

interface Aff {
  p: PageReport;
  ev?: string;
}

function mk(id: string, label: string, weight: number, total: number, affected: Aff[], ok: string, bad: string, force?: CheckStatus): Check {
  const n = affected.length;
  const status: CheckStatus = force ?? (n === 0 ? "pass" : n / Math.max(1, total) >= 0.34 ? "fail" : "warn");
  return {
    id,
    label,
    status,
    weight,
    detail: n === 0 ? ok : `${n} of ${total} page${total === 1 ? "" : "s"} — ${bad}`,
    affected: affected.map((a) => a.p.id),
    evidence: affected.slice(0, 6).map((a) => `${a.p.path}${a.ev ? " — " + a.ev : ""}`),
  };
}

const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const kb = (n: number) => `${(n / 1024).toFixed(n > 10240 ? 0 : 1)} KB`;

export function scoreFrom(key: ScoreBreakdown["key"], label: string, checks: Check[], total: number, method?: string): ScoreBreakdown {
  const items: ScoreItem[] = [];
  let penalty = 0;
  for (const c of checks) {
    if (c.status === "info") continue;
    if (c.affected.length === 0 && c.status === "pass") {
      items.push({ sign: "+", text: c.label + " — " + c.detail, points: 0 });
    } else {
      const ratio = c.affected.length / Math.max(1, total);
      const pts = Math.round(c.weight * Math.min(1, ratio) * 10) / 10;
      penalty += pts;
      items.push({ sign: "-", text: `${c.label} — ${c.detail}`, points: pts });
    }
  }
  items.sort((a, b) => (a.sign === b.sign ? b.points - a.points : a.sign === "+" ? -1 : 1));
  return {
    key,
    label,
    score: Math.max(0, Math.min(100, Math.round(100 - penalty))),
    method: method ?? "Starts at 100. Each check subtracts its weight × the share of analyzed pages affected. Passing checks subtract nothing.",
    items,
  };
}

export function seoSignals(pages: PageReport[], policy: CrawlPolicy, notes: CrawlNotes): SignalGroup {
  const ok = pages.filter(isOkPage);
  const t = Math.max(1, ok.length);
  const titleGroups = new Map<string, PageReport[]>();
  for (const p of ok) if (p.title) titleGroups.set(p.title.toLowerCase(), [...(titleGroups.get(p.title.toLowerCase()) ?? []), p]);
  const dupTitle: Aff[] = [];
  for (const g of titleGroups.values()) if (g.length > 1) g.forEach((p) => dupTitle.push({ p, ev: `"${p.title!.slice(0, 50)}" shared by ${g.length} pages` }));
  const broken = pages.filter((p) => p.broken);
  const checks: Check[] = [
    mk("title", "Page titles", 12, t, ok.filter((p) => !p.title).map((p) => ({ p })), "Every page has a title", "missing <title>"),
    mk("dup-title", "Unique titles", 10, t, dupTitle, "No duplicate titles", "share a title with another page"),
    mk("title-len", "Title length", 4, t, ok.filter((p) => p.title && (p.title.length < 10 || p.title.length > 70)).map((p) => ({ p, ev: `${p.title!.length} characters` })), "Titles are 10–70 characters", "title length outside 10–70 characters"),
    mk("desc", "Meta descriptions", 12, t, ok.filter((p) => !p.description).map((p) => ({ p })), "Every page has a meta description", "no meta description"),
    mk("canonical", "Canonical links", 8, t, ok.filter((p) => !p.canonical).map((p) => ({ p })), "Every page declares a canonical URL", "no canonical link"),
    mk("h1", "H1 heading", 10, t, ok.filter((p) => !p.headings.some((h) => h.level === 1 && h.text)).map((p) => ({ p })), "Every page has an H1", "no H1 detected"),
    mk("multi-h1", "Single H1", 4, t, ok.filter((p) => p.headings.filter((h) => h.level === 1).length > 1).map((p) => ({ p, ev: `${p.headings.filter((h) => h.level === 1).length} H1 elements` })), "No page has multiple H1s", "more than one H1"),
    mk("jsonld", "Structured data", 6, t, ok.filter((p) => !p.jsonLd.length).map((p) => ({ p })), "Structured data (JSON-LD) found on every page", "no JSON-LD structured data"),
    mk("og", "Open Graph", 6, t, ok.filter((p) => !p.og["og:title"]).map((p) => ({ p })), "Open Graph metadata on every page", "no og:title"),
    mk("sitemap", "Sitemap availability", 8, 1, policy.sitemapUrlCount === null ? [{ p: ok[0] ?? pages[0], ev: "no sitemap.xml found" }] : [], `Sitemap detected (${policy.sitemapUrlCount} URL${policy.sitemapUrlCount === 1 ? "" : "s"})`, "no sitemap detected"),
    mk("broken", "Broken pages", 14, t, broken.map((p) => ({ p, ev: p.status ? `HTTP ${p.status}` : p.error ?? "request failed" })), "No broken internal pages found", "linked internal pages returned errors"),
    mk("inlinks", "Internal linking", 6, t, ok.filter((p) => p.depth > 0 && p.incoming.length <= 1).map((p) => ({ p, ev: `${p.incoming.length} incoming link${p.incoming.length === 1 ? "" : "s"}` })), "All pages are linked from more than one page", "linked from at most one page"),
  ];
  const noindex = ok.filter((p) => /noindex/i.test(p.robotsMeta ?? ""));
  checks.push({ ...mk("noindex", "Robots directives", 0, t, noindex.map((p) => ({ p, ev: p.robotsMeta ?? "" })), "No noindex directives detected", "carry a noindex directive", "info") });
  return {
    key: "seo",
    label: "SEO SIGNALS",
    note: "A set of observable on-page signals. This is not a complete SEO audit.",
    checks,
    metrics: [
      { label: "Pages with title", value: `${ok.filter((p) => p.title).length}/${ok.length}` },
      { label: "Pages with description", value: `${ok.filter((p) => p.description).length}/${ok.length}` },
      { label: "Pages with canonical", value: `${ok.filter((p) => p.canonical).length}/${ok.length}` },
      { label: "Structured data types", value: [...new Set(ok.flatMap((p) => p.jsonLd))].slice(0, 6).join(", ") || "Not detected" },
      { label: "Sitemap", value: policy.sitemapUrlCount === null ? "Not detected" : `${policy.sitemapUrlCount} URLs` },
      { label: "Crawl completeness", value: notes.partial ? "Partial" : "Complete within limits" },
    ],
  };
}

const GENERIC_LINK = /^(click here|here|read more|more|learn more|link|this|details|continue|go|view)$/i;

export function a11ySignals(pages: PageReport[]): SignalGroup {
  const ok = pages.filter(isOkPage);
  const t = Math.max(1, ok.length);
  const missAlt = ok.map((p) => ({ p, n: p.images.filter((i) => i.alt === null).length, ex: p.images.find((i) => i.alt === null)?.src })).filter((x) => x.n > 0);
  const unlabeled = ok.map((p) => ({ p, n: p.forms.reduce((a, f) => a + (f.fields - f.labeled), 0) })).filter((x) => x.n > 0);
  const btn = ok.map((p) => ({ p, n: p.buttons.filter((b) => !b.labelled).length })).filter((x) => x.n > 0);
  const skips = ok
    .map((p) => {
      let prev = 0;
      let skip = "";
      for (const h of p.headings) {
        if (prev && h.level > prev + 1 && !skip) skip = `H${prev} → H${h.level}`;
        prev = h.level;
      }
      return { p, skip };
    })
    .filter((x) => x.skip);
  const generic = ok
    .map((p) => {
      const g = p.links.filter((l) => l.text && GENERIC_LINK.test(l.text));
      return { p, g };
    })
    .filter((x) => x.g.length > 0);
  const emptyLinks = ok.map((p) => ({ p, n: p.links.filter((l) => !l.text).length })).filter((x) => x.n > 0);
  const zoom = ok.filter((p) => p.viewport && /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(p.viewport));
  const checks: Check[] = [
    mk("alt", "Image alt text", 20, t, missAlt.map((x) => ({ p: x.p, ev: `${x.n} image${x.n === 1 ? "" : "s"} without alt${x.ex ? ` (e.g. ${x.ex.slice(-50)})` : ""}` })), "All images have an alt attribute", "images missing an alt attribute"),
    mk("labels", "Form labels", 18, t, unlabeled.map((x) => ({ p: x.p, ev: `${x.n} form field${x.n === 1 ? "" : "s"} without an accessible label` })), "All form fields have labels", "form fields without an accessible label"),
    mk("buttons", "Button labels", 14, t, btn.map((x) => ({ p: x.p, ev: `${x.n} button${x.n === 1 ? "" : "s"} without text or aria-label` })), "All buttons have accessible names", "buttons without an accessible name"),
    mk("lang", "Language attribute", 10, t, ok.filter((p) => !p.lang).map((p) => ({ p })), "Every page declares a lang attribute", "missing <html lang>"),
    mk("main", "Landmarks (main)", 10, t, ok.filter((p) => p.landmarks.main === 0).map((p) => ({ p })), "Every page has a main landmark", "no <main> landmark"),
    mk("headings", "Heading hierarchy", 10, t, skips.map((x) => ({ p: x.p, ev: `heading level skipped (${x.skip})` })), "No skipped heading levels", "skip heading levels"),
    mk("linktext", "Link text quality", 8, t, generic.map((x) => ({ p: x.p, ev: `${x.g.length} generic link${x.g.length === 1 ? "" : "s"} (e.g. "${x.g[0].text}")` })), "No generic link text detected", "use generic link text such as “read more”"),
    mk("zoom", "Zoom allowed", 6, t, zoom.map((p) => ({ p, ev: p.viewport ?? "" })), "Viewport does not block zoom", "viewport restricts zooming"),
    mk("emptylinks", "Links with names", 4, t, emptyLinks.map((x) => ({ p: x.p, ev: `${x.n} link${x.n === 1 ? "" : "s"} without discernible text` })), "All links have discernible text", "links without discernible text"),
  ];
  const totalImgs = ok.reduce((a, p) => a + p.images.length, 0);
  return {
    key: "a11y",
    label: "ACCESSIBILITY SIGNALS",
    note: "Automated checks on HTML signals only. This is not an accessibility certification — manual testing is required.",
    checks,
    metrics: [
      { label: "Images analyzed", value: String(totalImgs) },
      { label: "Images without alt", value: String(missAlt.reduce((a, x) => a + x.n, 0)) },
      { label: "Forms analyzed", value: String(ok.reduce((a, p) => a + p.forms.length, 0)) },
      { label: "Pages with <main>", value: `${ok.filter((p) => p.landmarks.main > 0).length}/${ok.length}` },
      { label: "Pages with lang", value: `${ok.filter((p) => p.lang).length}/${ok.length}` },
    ],
  };
}

export function perfSignals(pages: PageReport[]): SignalGroup {
  const ok = pages.filter(isOkPage);
  const t = Math.max(1, ok.length);
  const resCount = (p: PageReport) => p.scripts.length + p.styles.length + p.images.length + p.fontRefs.length;
  const checks: Check[] = [
    mk("resp", "Response time", 20, t, ok.filter((p) => p.responseMs > 1000).map((p) => ({ p, ev: `${p.responseMs} ms` })), "All pages responded within 1 s", "responded slower than 1 s"),
    mk("html", "HTML size", 10, t, ok.filter((p) => p.htmlBytes > 500 * 1024).map((p) => ({ p, ev: kb(p.htmlBytes) })), "No oversized HTML documents", "HTML larger than 500 KB"),
    mk("scripts", "Script count", 14, t, ok.filter((p) => p.scripts.length + p.inlineScripts > 30).map((p) => ({ p, ev: `${p.scripts.length} external + ${p.inlineScripts} inline scripts` })), "Script counts are moderate", "more than 30 scripts"),
    mk("blocking", "Render-blocking scripts", 16, t, ok.filter((p) => p.scripts.some((s) => s.src && s.inHead && !s.async && !s.defer && !s.module)).map((p) => ({ p, ev: `${p.scripts.filter((s) => s.src && s.inHead && !s.async && !s.defer && !s.module).length} blocking script(s) in <head>` })), "No render-blocking scripts in <head>", "have synchronous scripts in <head>"),
    mk("css", "Stylesheets", 8, t, ok.filter((p) => p.styles.filter((s) => s.blocking).length > 5).map((p) => ({ p, ev: `${p.styles.length} stylesheets` })), "Stylesheet counts are moderate", "more than 5 blocking stylesheets"),
    mk("fonts", "Font requests", 6, t, ok.filter((p) => p.fontRefs.length > 4).map((p) => ({ p, ev: `${p.fontRefs.length} font references` })), "Font usage is moderate", "reference more than 4 fonts"),
    mk("dims", "Image dimensions", 10, t, ok.filter((p) => p.images.some((i) => !i.hasDimensions && !i.src.startsWith("inline:"))).map((p) => ({ p, ev: `${p.images.filter((i) => !i.hasDimensions).length} image(s) without width/height` })), "Images declare dimensions", "images without width/height (layout shift risk)"),
    mk("compress", "Compression", 10, t, ok.filter((p) => p.htmlBytes > 5000 && !p.compressed).map((p) => ({ p, ev: kb(p.htmlBytes) + " uncompressed" })), "HTML is served compressed", "HTML served without compression"),
    mk("resources", "Resource count", 6, t, ok.filter((p) => resCount(p) > 100).map((p) => ({ p, ev: `${resCount(p)} referenced resources` })), "Resource counts are moderate", "reference more than 100 resources"),
  ];
  const rt = ok.map((p) => p.responseMs);
  return {
    key: "perf",
    label: "PERFORMANCE SIGNALS",
    note: "Measured from the TRACE crawler region using plain HTTP fetches. Real user performance varies by device, network and location. No browser rendering metrics are collected.",
    checks,
    metrics: [
      { label: "Median response", value: `${Math.round(median(rt))} ms` },
      { label: "Slowest response", value: `${Math.max(0, ...rt)} ms` },
      { label: "Average HTML size", value: kb(avg(ok.map((p) => p.htmlBytes))) },
      { label: "Average scripts / page", value: avg(ok.map((p) => p.scripts.length)).toFixed(1) },
      { label: "Average stylesheets / page", value: avg(ok.map((p) => p.styles.length)).toFixed(1) },
      { label: "Average images / page", value: avg(ok.map((p) => p.images.length)).toFixed(1) },
    ],
  };
}

export function structureScore(pages: PageReport[], navDetected: boolean): ScoreBreakdown {
  const ok = pages.filter(isOkPage);
  const t = Math.max(1, ok.length);
  const checks: Check[] = [
    mk("broken", "Broken internal pages", 25, pages.length, pages.filter((p) => p.broken).map((p) => ({ p, ev: p.status ? `HTTP ${p.status}` : "request failed" })), "No broken internal pages", "returned errors"),
    mk("orphan", "Pages connected to navigation", 15, t, ok.filter((p) => p.orphanLike).map((p) => ({ p })), "No orphan-like pages", "are weakly connected (not in primary navigation, ≤1 incoming link)"),
    mk("deadend", "Onward links", 15, t, ok.filter((p) => !p.outgoing.length).map((p) => ({ p })), "Every page links onward to another page", "link to no other analyzed page"),
    mk("deep", "Shallow depth", 10, t, ok.filter((p) => p.depth >= 3).map((p) => ({ p, ev: `depth ${p.depth}` })), "No page is deeper than 2 clicks", "are 3 or more clicks from the start page"),
    mk("navland", "Navigation landmark", 15, t, ok.filter((p) => p.landmarks.nav === 0).map((p) => ({ p })), "Every page exposes a navigation landmark", "have no <nav> landmark"),
    mk("canon", "Canonical consistency", 10, t, ok.filter((p) => p.canonical && normalizeCmp(p.canonical) !== normalizeCmp(p.url)).map((p) => ({ p, ev: `canonical → ${p.canonical}` })), "Canonicals point to the page itself", "declare a different canonical URL"),
    mk("navdet", "Primary navigation detected", 10, 1, navDetected ? [] : [{ p: ok[0] ?? pages[0], ev: "no nav/header links on start page" }], "Primary navigation detected on the start page", "no primary navigation links detected on the start page"),
  ];
  return scoreFrom("structure", "STRUCTURE", checks, t);
}

function normalizeCmp(u: string) {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/$/, "") + x.search;
  } catch {
    return u;
  }
}

export function contentScore(pages: PageReport[]): ScoreBreakdown {
  const ok = pages.filter(isOkPage);
  const t = Math.max(1, ok.length);
  const dup = new Map<string, PageReport[]>();
  for (const p of ok) if (p.textHash) dup.set(p.textHash, [...(dup.get(p.textHash) ?? []), p]);
  const dups: Aff[] = [];
  for (const g of dup.values()) if (g.length > 1) g.forEach((p) => dups.push({ p, ev: `same body text as ${g.length - 1} other page(s)` }));
  const exempt = new Set(["Login", "Signup", "Checkout", "Contact", "Legal"]);
  const checks: Check[] = [
    mk("thin", "Substantial content", 30, t, ok.filter((p) => !exempt.has(p.type) && p.wordCount < 150).map((p) => ({ p, ev: `${p.wordCount} words` })), "All content pages have 150+ words", "have fewer than 150 words"),
    mk("dupc", "Unique body content", 25, t, dups, "No duplicate body content", "share near-identical body text"),
    mk("h1", "Primary heading", 15, t, ok.filter((p) => !p.headings.some((h) => h.level === 1 && h.text)).map((p) => ({ p })), "Every page has an H1", "have no H1"),
    mk("struct", "Heading structure", 15, t, ok.filter((p) => p.wordCount > 300 && !p.headings.some((h) => h.level === 2)).map((p) => ({ p, ev: `${p.wordCount} words, no H2` })), "Long pages are broken up with subheadings", "are long but have no subheadings"),
    mk("text", "Readable text blocks", 15, t, ok.filter((p) => p.blocks.length === 0 && !p.jsShell).map((p) => ({ p })), "Every page has readable text blocks", "have no readable text blocks in the server HTML"),
  ];
  return scoreFrom("content", "CONTENT", checks, t);
}
