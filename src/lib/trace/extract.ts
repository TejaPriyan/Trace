import "server-only";
import * as cheerio from "cheerio";
import crypto from "node:crypto";
import type {
  ButtonRef,
  FormRef,
  HeadingRef,
  ImageRef,
  LinkArea,
  LinkRef,
  PageData,
  ResourceRef,
  ScriptRef,
  StyleRef,
  TextBlock,
} from "./types";
import { LIMITS } from "./limits";
import { siteKey } from "./security";
import { detectTech } from "./tech";

export interface ExtractContext {
  url: string; // final URL of the page
  siteHost: string;
  status: number;
  headers: Record<string, string>;
  depth: number;
  parentUrl: string | null;
  responseMs: number;
  htmlBytes: number;
  redirectedFrom: string | null;
  analyzeAssets: boolean;
}

const CTA_RE = /\b(get started|sign ?up|sign ?in|log ?in|try|start|buy|subscribe|download|book|request|contact|join|learn more|see pricing|view pricing|demo|add to cart|checkout|register|get a quote|talk to|free trial|shop now)\b/i;
const NON_PAGE_EXT = /\.(pdf|png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|zip|gz|tar|rar|7z|mp3|mp4|webm|mov|avi|woff2?|ttf|otf|eot|doc|docx|xls|xlsx|ppt|pptx|csv|txt|rss|atom|dmg|exe|apk)$/i;

export function isLikelyPageUrl(u: URL): boolean {
  return !NON_PAGE_EXT.test(u.pathname);
}

function clean(s: string | undefined | null, max = 200): string {
  return (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function resolve(href: string | undefined, base: string): URL | null {
  if (!href) return null;
  const h = href.trim();
  if (!h || h.startsWith("#") || /^(javascript|mailto|tel|data|sms|blob|about):/i.test(h)) return null;
  try {
    const u = new URL(h, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

export function emptyPage(url: string, depth: number, parentUrl: string | null, init: Partial<PageData>): PageData {
  let path = "/";
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {}
  return {
    url,
    path,
    status: null,
    error: null,
    contentType: null,
    depth,
    parentUrl,
    responseMs: 0,
    htmlBytes: 0,
    compressed: false,
    title: null,
    description: null,
    canonical: null,
    lang: null,
    favicon: null,
    viewport: null,
    robotsMeta: null,
    og: {},
    twitter: {},
    jsonLd: [],
    generator: null,
    headings: [],
    images: [],
    links: [],
    forms: [],
    buttons: [],
    scripts: [],
    inlineScripts: 0,
    styles: [],
    fontRefs: [],
    iframes: [],
    videos: 0,
    audios: 0,
    landmarks: { main: 0, nav: 0, header: 0, footer: 0, aside: 0 },
    wordCount: 0,
    textHash: null,
    blocks: [],
    ctas: [],
    resources: [],
    tech: [],
    jsShell: false,
    redirectedFrom: null,
    ...init,
  };
}

export function extractPage(html: string, ctx: ExtractContext): PageData {
  const $ = cheerio.load(html);
  const baseHref = $("base[href]").first().attr("href");
  const base = (baseHref && resolve(baseHref, ctx.url)?.href) || ctx.url;
  const site = siteKey(ctx.siteHost);
  const u0 = new URL(ctx.url);

  const meta = (sel: string) => clean($(sel).first().attr("content"), 400) || null;
  const title = clean($("head title").first().text() || $("title").first().text(), 300) || null;
  const description = meta('meta[name="description" i]');
  const canonicalHref = $('link[rel~="canonical" i]').first().attr("href");
  const canonical = canonicalHref ? resolve(canonicalHref, base)?.href ?? null : null;
  const lang = clean($("html").attr("lang"), 20) || null;
  const iconHref = $('link[rel~="icon" i]').first().attr("href") || $('link[rel="shortcut icon" i]').first().attr("href");
  const favicon = iconHref ? resolve(iconHref, base)?.href ?? null : null;
  const viewport = meta('meta[name="viewport" i]');
  const robotsMeta = meta('meta[name="robots" i]');
  const generator = meta('meta[name="generator" i]');

  const og: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  $("meta[property^='og:'], meta[name^='og:']").each((_, el) => {
    const k = ($(el).attr("property") || $(el).attr("name") || "").toLowerCase();
    const v = clean($(el).attr("content"), 300);
    if (k && v && Object.keys(og).length < 20) og[k] = v;
  });
  $("meta[name^='twitter:'], meta[property^='twitter:']").each((_, el) => {
    const k = ($(el).attr("name") || $(el).attr("property") || "").toLowerCase();
    const v = clean($(el).attr("content"), 300);
    if (k && v && Object.keys(twitter).length < 20) twitter[k] = v;
  });

  // JSON-LD types
  const jsonLd: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    if (txt.length > 400_000) return;
    try {
      const walk = (n: unknown) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          const t = o["@type"];
          if (typeof t === "string") jsonLd.push(t);
          else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && jsonLd.push(x));
          if (o["@graph"]) walk(o["@graph"]);
        }
      };
      walk(JSON.parse(txt));
    } catch {}
  });

  // Scripts (before removal)
  const scripts: ScriptRef[] = [];
  let inlineScripts = 0;
  const inlineText: string[] = [];
  $("script").each((_, el) => {
    const src = $(el).attr("src");
    const type = ($(el).attr("type") || "").toLowerCase();
    if (type === "application/ld+json") return;
    if (src) {
      const r = resolve(src, base);
      if (r && scripts.length < 120)
        scripts.push({
          src: r.href,
          async: $(el).attr("async") !== undefined,
          defer: $(el).attr("defer") !== undefined,
          module: type === "module",
          inHead: $(el).closest("head").length > 0,
        });
    } else {
      inlineScripts++;
      if (inlineText.length < 12) inlineText.push($(el).contents().text().slice(0, 20000));
    }
  });

  const styles: StyleRef[] = [];
  $('link[rel~="stylesheet" i]').each((_, el) => {
    const r = resolve($(el).attr("href"), base);
    const media = ($(el).attr("media") || "").toLowerCase();
    if (r && styles.length < 60) styles.push({ href: r.href, blocking: !media || media === "all" || media === "screen" });
  });
  const fontRefs: string[] = [];
  $('link[rel~="preload" i][as="font" i], link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"], link[href*="typekit.net"]').each((_, el) => {
    const r = resolve($(el).attr("href"), base);
    if (r && fontRefs.length < 20) fontRefs.push(r.href);
  });
  let inlineFontFace = 0;
  $("style").each((_, el) => {
    inlineFontFace += ($(el).contents().text().match(/@font-face/g) || []).length;
  });
  for (let i = 0; i < Math.min(inlineFontFace, 10); i++) fontRefs.push("inline:@font-face");

  // Resources: preconnect, feeds, manifest, API-like references (public references only, no query strings)
  const resources: ResourceRef[] = [];
  const addRes = (url: string, kind: ResourceRef["kind"]) => {
    if (resources.length >= 25) return;
    try {
      const u = new URL(url, base);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      const clean = u.origin + u.pathname;
      if (!resources.some((r) => r.url === clean && r.kind === kind)) resources.push({ url: clean, kind });
    } catch {}
  };
  $('link[rel~="preconnect" i], link[rel~="dns-prefetch" i]').each((_, el) => {
    const h = $(el).attr("href");
    if (h) addRes(h, "preconnect");
  });
  $('link[rel~="alternate" i][type*="rss" i], link[rel~="alternate" i][type*="atom" i]').each((_, el) => {
    const h = $(el).attr("href");
    if (h) addRes(h, "feed");
  });
  const mf = $('link[rel~="manifest" i]').first().attr("href");
  if (mf) addRes(mf, "manifest");
  const apiRe = /["'`](\/(?:api|graphql|v\d)\/[\w\-/.]{1,80})["'`]/g;
  const absApiRe = /https?:\/\/(?:api|graphql|gateway)\.[\w.-]+(?:\/[\w\-/]{0,60})?/g;
  for (const t of inlineText) {
    for (const m of t.matchAll(apiRe)) addRes(m[1], /graphql/i.test(m[1]) ? "graphql" : "api");
    for (const m of t.matchAll(absApiRe)) addRes(m[0], /graphql/i.test(m[0]) ? "graphql" : "api");
  }
  $("link[href], a[href]").each((_, el) => {
    const h = $(el).attr("href") || "";
    if (/\/wp-json\/?$/i.test(h) || /\/graphql\/?$/i.test(h)) addRes(h, /graphql/i.test(h) ? "graphql" : "api");
  });

  // Tech detection from raw HTML + resource URLs + headers
  const urls: string[] = [
    ...scripts.map((s) => s.src!),
    ...styles.map((s) => s.href),
    ...fontRefs,
    ...resources.map((r) => r.url),
  ];
  $("iframe[src], img[src], source[src], video[src]").each((_, el) => {
    const r = resolve($(el).attr("src"), base);
    if (r && urls.length < 400) urls.push(r.href);
  });
  $("a[href]").each((_, el) => {
    const h = $(el).attr("href") || "";
    if (/^https?:\/\//i.test(h) && urls.length < 600) urls.push(h);
  });
  const tech = detectTech({ html: html.slice(0, 600_000), urls, headers: ctx.headers });

  // Iframes / media
  const iframes: string[] = [];
  $("iframe[src]").each((_, el) => {
    const r = resolve($(el).attr("src"), base);
    if (r && iframes.length < 20) iframes.push(r.href);
  });
  const videos = $("video").length;
  const audios = $("audio").length;

  // Images
  const images: ImageRef[] = [];
  $("img").each((_, el) => {
    if (images.length >= 200) return;
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    const r = src.startsWith("data:") ? null : resolve(src, base);
    const altAttr = $(el).attr("alt");
    images.push({
      src: r ? r.href : src.startsWith("data:") ? "inline:data-uri" : src.slice(0, 200),
      alt: altAttr === undefined ? null : clean(altAttr, 160),
      hasDimensions: !!($(el).attr("width") && $(el).attr("height")),
      lazy: ($(el).attr("loading") || "").toLowerCase() === "lazy",
    });
  });

  // Landmarks
  const cnt = (tag: string, role: string) => $(`${tag}, [role="${role}"]`).length;
  const landmarks = { main: cnt("main", "main"), nav: cnt("nav", "navigation"), header: cnt("header", "banner"), footer: cnt("footer", "contentinfo"), aside: cnt("aside", "complementary") };

  // Links
  const links: LinkRef[] = [];
  $("a[href]").each((_, el) => {
    if (links.length >= LIMITS.MAX_LINKS_PER_PAGE) return;
    const $a = $(el);
    const r = resolve($a.attr("href"), base);
    if (!r) return;
    let area: LinkArea = "other";
    if ($a.closest("nav, [role='navigation']").length) area = "nav";
    else if ($a.closest("header, [role='banner']").length) area = "header";
    else if ($a.closest("footer, [role='contentinfo']").length) area = "footer";
    else if ($a.closest("main, [role='main'], article").length) area = "main";
    const text = clean($a.text(), 100) || clean($a.attr("aria-label"), 100) || clean($a.attr("title"), 100) || clean($a.find("img[alt]").first().attr("alt"), 100);
    links.push({
      url: r.href,
      text,
      area,
      internal: siteKey(r.hostname) === site,
      nofollow: /nofollow|sponsored|ugc/i.test($a.attr("rel") || ""),
    });
  });

  // Forms
  const forms: FormRef[] = [];
  $("form").each((_, el) => {
    if (forms.length >= 15) return;
    const $f = $(el);
    const fields = $f.find("input, select, textarea").filter((__, i) => {
      const t = ($(i).attr("type") || "text").toLowerCase();
      return !["hidden", "submit", "button", "image", "reset"].includes(t);
    });
    let labeled = 0;
    fields.each((__, i) => {
      const $i = $(i);
      const id = $i.attr("id");
      if (
        $i.attr("aria-label") ||
        $i.attr("aria-labelledby") ||
        $i.attr("title") ||
        $i.closest("label").length ||
        (id && $f.find("label").filter((___, l) => $(l).attr("for") === id).length) ||
        (id && $(`label[for="${id.replace(/"/g, "")}"]`).length)
      )
        labeled++;
    });
    const act = resolve($f.attr("action") || "", base);
    forms.push({
      action: act ? act.origin + act.pathname : u0.origin + u0.pathname,
      method: ($f.attr("method") || "get").toLowerCase(),
      fields: fields.length,
      labeled,
      hasPassword: $f.find("input[type=password]").length > 0,
      hasEmail: $f.find("input[type=email], input[name*=email i]").length > 0,
      text: clean($f.find("button, input[type=submit]").first().text() || $f.find("input[type=submit]").first().attr("value"), 60),
    });
  });
  for (const f of forms) if (f.action) addRes(f.action, "form-action");

  // Buttons
  const buttons: ButtonRef[] = [];
  $("button, [role='button'], input[type='submit'], input[type='button']").each((_, el) => {
    if (buttons.length >= 100) return;
    const $b = $(el);
    const text = clean($b.text() || $b.attr("value"), 80);
    const aria = clean($b.attr("aria-label") || $b.attr("title") || $b.attr("aria-labelledby"), 80);
    buttons.push({ text: text || aria, labelled: !!(text || aria) });
  });

  // CTAs
  const ctas: string[] = [];
  $("a, button").each((_, el) => {
    if (ctas.length >= 20) return;
    const t = clean($(el).text(), 50);
    if (t.length >= 3 && CTA_RE.test(t) && !ctas.includes(t)) ctas.push(t);
  });

  // Headings
  const headings: HeadingRef[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    if (headings.length >= 80) return;
    const text = clean($(el).text(), 140);
    const level = Number((el as { tagName: string }).tagName.slice(1));
    if (text) headings.push({ level, text });
    else headings.push({ level, text: "" });
  });

  // Text blocks and word count (main content, excluding chrome)
  $("script, style, noscript, template, svg, iframe").remove();
  const jsMarkers = /enable javascript|requires javascript|javascript is required|you need to enable javascript/i.test($("body").text());
  const $root = $("main, [role='main']").first().length ? $("main, [role='main']").first() : $("body");
  const $content = $root.clone();
  $content.find("nav, header, footer, aside, [role='navigation'], [role='banner'], [role='contentinfo']").remove();
  const text = clean($content.text(), 400_000);
  const wordCount = text ? text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;
  const blocks: TextBlock[] = [];
  const seenBlocks = new Set<string>();
  $content.find("p, li, blockquote, h2, h3").each((_, el) => {
    if (blocks.length >= 16) return;
    const $e = $(el);
    const t = clean($e.text(), 300);
    if (t.length < 40 || t.length > 280 || seenBlocks.has(t)) return;
    seenBlocks.add(t);
    let cite: string | null = null;
    $e.find("a[href]").each((__, a) => {
      if (cite) return;
      const r = resolve($(a).attr("href"), base);
      if (r && siteKey(r.hostname) !== site) cite = siteKey(r.hostname);
    });
    blocks.push({ text: t, cite });
  });
  const textHash = wordCount >= 30 ? crypto.createHash("sha1").update(text.toLowerCase().slice(0, 4000)).digest("hex").slice(0, 16) : null;
  const rootEl = $("#root, #app, #__next, #__nuxt, [data-reactroot]").length > 0;
  const jsShell = wordCount < 40 && scripts.length > 0 && (jsMarkers || rootEl || scripts.length >= 3);

  let path = u0.pathname + u0.search;
  if (path === "") path = "/";
  return {
    url: ctx.url,
    path,
    status: ctx.status,
    error: null,
    headers: ctx.headers,
    contentType: ctx.headers["content-type"]?.split(";")[0].trim() ?? null,
    depth: ctx.depth,
    parentUrl: ctx.parentUrl,
    responseMs: ctx.responseMs,
    htmlBytes: ctx.htmlBytes,
    compressed: !!ctx.headers["content-encoding"],
    title,
    description,
    canonical,
    lang,
    favicon,
    viewport,
    robotsMeta,
    og,
    twitter,
    jsonLd: [...new Set(jsonLd)].slice(0, 12),
    generator,
    headings,
    images,
    links,
    forms,
    buttons,
    scripts,
    inlineScripts,
    styles,
    fontRefs,
    iframes,
    videos,
    audios,
    landmarks,
    wordCount,
    textHash,
    blocks,
    ctas,
    resources,
    tech,
    jsShell,
    redirectedFrom: ctx.redirectedFrom,
  };
}
