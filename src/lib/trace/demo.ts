import type { LinkArea, LinkRef, PageData, TechHit, TraceReport } from "./types";
import { DEFAULT_SETTINGS } from "./limits";
import { emptyPage } from "./extract";
import { buildReport } from "./report";

// Bundled sample dataset for "Explore demo". This is NOT a live crawl: the raw page records below are
// static sample data about a fictional site, run through TRACE's real analysis pipeline.
const SITE = "https://lumen.example";

interface Spec {
  path: string;
  title: string | null;
  desc?: string | null;
  h1?: string | null;
  h2?: string[];
  words: number;
  depth: number;
  parent?: string;
  links?: string[];
  ext?: string[];
  blocks?: string[];
  status?: number;
  images?: number;
  missingAlt?: number;
  email?: boolean;
  contactForm?: boolean;
  login?: boolean;
  ld?: string[];
  ctas?: string[];
  stripe?: boolean;
  noCanonical?: boolean;
}

const NAV = ["/", "/products", "/pricing", "/blog", "/docs", "/about", "/contact", "/login"];
const FOOT = ["/privacy", "/terms", "/about", "/contact"];
const FOOT_EXT = ["https://github.com/lumen-hq", "https://twitter.com/lumenhq", "https://www.linkedin.com/company/lumen-hq"];

const SPECS: Spec[] = [
  { path: "/", title: "Lumen — Observability for modern teams", desc: "Lumen helps engineering teams understand production systems with traces, metrics and logs in one place.", h1: "See inside every system you run", h2: ["Everything in one timeline", "Built for teams", "Trusted by 4,000+ engineering teams"], words: 620, depth: 0, links: ["/products", "/products/atlas", "/pricing", "/signup", "/blog/introducing-lumen", "/docs/getting-started"], ext: ["https://opentelemetry.io/"], blocks: ["Lumen helps teams collaborate on incidents by putting traces, metrics and logs on a single timeline.", "Trusted by 4,000+ engineering teams across 60 countries, from seed-stage startups to public companies.", "Our platform ensures every deploy is observable from the first request, with zero-config instrumentation."], images: 6, missingAlt: 1, email: true, ld: ["Organization", "WebSite"], ctas: ["Get started free", "Book a demo", "See pricing"] },
  { path: "/about", title: "About Lumen", desc: "The team behind Lumen.", h1: "About Lumen", h2: ["Our story", "Our values"], words: 410, depth: 1, links: ["/careers", "/contact", "/blog/introducing-lumen"], blocks: ["We believe every engineer deserves to understand the systems they ship, without needing a dedicated observability team.", "Lumen was founded in 2019 and is built by a distributed team of 80 people."], images: 4, ctas: ["Join us"] },
  { path: "/careers", title: "Careers at Lumen", desc: null, h1: "Join the team", h2: ["Open roles"], words: 180, depth: 2, parent: "/about", links: ["/contact"], images: 2, missingAlt: 2, ctas: ["Join us"] },
  { path: "/products", title: "Products — Lumen", desc: "Atlas, Beacon and Prism: the Lumen product suite.", h1: "The Lumen platform", h2: ["Atlas", "Beacon", "Prism"], words: 380, depth: 1, links: ["/products/atlas", "/products/beacon", "/products/prism", "/products/legacy", "/pricing"], blocks: ["Our platform provides tracing, alerting and analytics that work together out of the box.", "Every product shares one data model, so teams can move from alert to root cause in a few clicks."], images: 5, ld: ["ItemList"], ctas: ["Get started free", "See pricing"] },
  { path: "/products/atlas", title: "Atlas — Distributed tracing", desc: "Atlas gives you end-to-end distributed tracing with zero-config instrumentation.", h1: "Atlas", h2: ["Tracing", "Service map", "Sampling"], words: 540, depth: 2, parent: "/products", links: ["/products/beacon", "/pricing", "/docs/getting-started", "/signup"], blocks: ["Atlas lets teams trace every request across services, so slow endpoints are easy to find.", "Our zero-config instrumentation ensures every deploy is observable from the first request."], images: 7, ld: ["Product"], ctas: ["Get started free", "Read the docs"] },
  { path: "/products/beacon", title: "Beacon — Alerting", desc: "Beacon routes the right alerts to the right people.", h1: "Beacon", h2: ["Alert routing", "On-call"], words: 470, depth: 2, parent: "/products", links: ["/products/atlas", "/pricing", "/docs/api-reference"], blocks: ["Beacon makes on-call calmer by grouping related alerts into a single incident."], images: 5, missingAlt: 1, ld: ["Product"], ctas: ["Get started free"] },
  { path: "/products/prism", title: "Prism — Analytics", desc: "Prism turns telemetry into dashboards.", h1: "Prism", h2: ["Dashboards", "Queries"], words: 430, depth: 2, parent: "/products", links: ["/pricing", "/docs/sdk"], blocks: ["Prism allows teams to query telemetry using plain SQL and share dashboards with anyone."], images: 5, ld: ["Product"], ctas: ["Get started free"] },
  { path: "/products/legacy", title: null, words: 0, depth: 2, parent: "/products", status: 404 },
  { path: "/pricing", title: "Pricing — Lumen", desc: "Simple, usage-based pricing for teams of any size.", h1: "Simple, usage-based pricing", h2: ["Starter", "Team", "Enterprise", "FAQ"], words: 520, depth: 1, links: ["/signup", "/contact", "/products/atlas", "/docs/getting-started"], blocks: ["Our free plan includes 10 million events a month, with no credit card required.", "Enterprise customers can add SSO, audit logs and a dedicated support engineer."], images: 3, stripe: true, ld: ["Product"], ctas: ["Start free trial", "Talk to sales", "Get started free"] },
  { path: "/signup", title: "Create your Lumen account", desc: "Start free in under two minutes.", h1: "Create your account", words: 90, depth: 2, parent: "/pricing", links: ["/login", "/terms", "/privacy"], login: true, email: true, images: 1, ctas: ["Create account"] },
  { path: "/login", title: "Log in to Lumen", desc: null, h1: "Welcome back", words: 60, depth: 1, links: ["/signup"], login: true, images: 1, ctas: ["Log in"], noCanonical: true },
  { path: "/blog", title: "The Lumen blog", desc: "Engineering stories and product news.", h1: "Blog", h2: ["Latest", "Popular"], words: 300, depth: 1, links: ["/blog/introducing-lumen", "/blog/state-of-observability", "/blog/shipping-faster", "/blog/migrating-to-edge", "/blog/archive/2022"], email: true, images: 8, missingAlt: 3, ld: ["Blog"], ctas: ["Subscribe"] },
  { path: "/blog/introducing-lumen", title: "Introducing Lumen", desc: "Why we built Lumen.", h1: "Introducing Lumen", h2: ["The problem", "What we built", "What's next"], words: 1100, depth: 2, parent: "/blog", links: ["/blog/state-of-observability", "/products/atlas", "/blog"], ext: ["https://opentelemetry.io/docs/"], blocks: ["Lumen helps teams collaborate on incidents by putting traces, metrics and logs on a single timeline.", "According to the Google SRE book, monitoring should answer what is broken and why.", "We built Lumen because production debugging should not need five browser tabs."], images: 4, ld: ["Article"], ctas: ["Get started free"] },
  { path: "/blog/state-of-observability", title: "The state of observability in 2025", desc: "Survey results from 1,200 engineers.", h1: "The state of observability in 2025", h2: ["Method", "Findings", "What teams plan next"], words: 1600, depth: 2, parent: "/blog", links: ["/blog/shipping-faster", "/products/prism", "/blog"], ext: ["https://sre.google/sre-book/monitoring-distributed-systems/", "https://opentelemetry.io/"], blocks: ["72% of surveyed teams say they cannot trace a request across more than three services.", "Most teams are the best they can be at alerting, but fewer than a third are confident in their sampling strategy."], images: 9, missingAlt: 2, ld: ["Article"], ctas: ["Subscribe"] },
  { path: "/blog/shipping-faster", title: "Shipping faster with observability", desc: null, h1: "Shipping faster with observability", h2: ["Fast feedback"], words: 880, depth: 2, parent: "/blog", links: ["/blog/migrating-to-edge", "/products/beacon"], blocks: ["Observability makes deploys safer, so teams ship more often without increasing incident rates."], images: 3, ld: ["Article"], ctas: ["Get started free"] },
  { path: "/blog/migrating-to-edge", title: "Migrating to the edge", desc: "A migration playbook.", h1: "Migrating to the edge", h2: ["Plan", "Execute"], words: 950, depth: 2, parent: "/blog", links: ["/docs/sdk", "/blog"], ext: ["https://github.com/lumen-hq/edge-sdk"], blocks: ["Our edge SDK is designed to add less than one millisecond of latency to each request."], images: 4, ld: ["Article"], ctas: ["Read the docs"] },
  { path: "/blog/archive/2022", title: "Archive: 2022", desc: null, h1: "2022 archive", words: 140, depth: 3, parent: "/blog", links: ["/blog"], images: 0 },
  { path: "/docs", title: "Lumen documentation", desc: "Guides and API reference.", h1: "Documentation", h2: ["Start here", "Guides", "Reference"], words: 260, depth: 1, links: ["/docs/getting-started", "/docs/api-reference", "/docs/sdk"], images: 2, ctas: ["Read the docs"] },
  { path: "/docs/getting-started", title: "Getting started — Lumen docs", desc: "Install the SDK and send your first trace.", h1: "Getting started", h2: ["Install", "Configure", "Send a trace", "Verify"], words: 1300, depth: 2, parent: "/docs", links: ["/docs/sdk", "/docs/api-reference", "/products/atlas"], ext: ["https://github.com/lumen-hq/lumen-js"], blocks: ["Install the Lumen SDK with a single command, then send your first trace in under five minutes."], images: 3, missingAlt: 1, ld: ["TechArticle"] },
  { path: "/docs/sdk", title: "SDKs — Lumen docs", desc: "Official SDKs for JavaScript, Python and Go.", h1: "SDKs", h2: ["JavaScript", "Python", "Go"], words: 900, depth: 2, parent: "/docs", links: ["/docs/getting-started", "/docs/api-reference"], ext: ["https://github.com/lumen-hq/lumen-js", "https://pypi.org/project/lumen/"], images: 1 },
  { path: "/docs/api-reference", title: "API reference — Lumen docs", desc: "REST API reference.", h1: "API reference", h2: ["Authentication", "Traces", "Alerts", "Webhooks"], words: 2400, depth: 2, parent: "/docs", links: ["/docs/api-reference/webhooks", "/docs/sdk"], images: 0 },
  { path: "/docs/api-reference/webhooks", title: "Webhooks — Lumen docs", desc: null, h1: "Webhooks", h2: ["Events", "Signatures"], words: 700, depth: 3, parent: "/docs/api-reference", links: ["/docs/api-reference"], images: 0 },
  { path: "/contact", title: "Contact Lumen", desc: "Talk to our team.", h1: "Contact us", h2: ["Sales", "Support"], words: 160, depth: 1, links: ["/docs", "/about"], contactForm: true, images: 1, ctas: ["Send message"] },
  { path: "/privacy", title: "Privacy policy", desc: "How Lumen handles data.", h1: "Privacy policy", words: 1800, depth: 1, links: ["/terms"], images: 0 },
  { path: "/terms", title: "Terms of service", desc: "Terms of service.", h1: "Terms of service", words: 2200, depth: 1, links: ["/privacy"], images: 0 },
];

function abs(p: string) {
  return SITE + (p === "/" ? "" : p) + (p === "/" ? "/" : "");
}
const full = (p: string) => (p === "/" ? SITE + "/" : SITE + p);
void abs;

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

function techFor(s: Spec): TechHit[] {
  const t: TechHit[] = [
    { name: "Next.js", category: "Framework", confidence: "High", signal: "Next.js-specific resource patterns (resource)", evidence: `Resource reference: ${SITE}/_next/static/chunks/main.js` },
    { name: "React", category: "Framework", confidence: "Medium", signal: "React markers in markup or bundles (html)", evidence: "HTML marker: __reactContainer" },
    { name: "Vercel", category: "Hosting", confidence: "High", signal: "Vercel response headers (header)", evidence: "Response header: server: Vercel" },
    { name: "Google Analytics", category: "Analytics", confidence: "High", signal: "Google Analytics script/endpoint (resource)", evidence: "Resource reference: https://www.googletagmanager.com/gtag/js?id=G-DEMO" },
    { name: "Google Fonts", category: "Font", confidence: "High", signal: "fonts.googleapis.com stylesheet (resource)", evidence: "Resource reference: https://fonts.googleapis.com/css2?family=Inter" },
  ];
  if (s.stripe) t.push({ name: "Stripe", category: "Payment", confidence: "High", signal: "Stripe.js reference (resource)", evidence: "Resource reference: https://js.stripe.com/v3/" });
  if (s.path.startsWith("/docs")) t.push({ name: "Algolia", category: "Other", confidence: "Medium", signal: "Algolia client (resource)", evidence: "Resource reference: https://cdn.jsdelivr.net/npm/@docsearch/js" }, { name: "jsDelivr", category: "CDN", confidence: "Medium", signal: "cdn.jsdelivr.net resources (resource)", evidence: "Resource reference: https://cdn.jsdelivr.net/npm/@docsearch/js" });
  if (s.path === "/contact") t.push({ name: "reCAPTCHA", category: "Other", confidence: "High", signal: "Google reCAPTCHA (resource)", evidence: "Resource reference: https://www.google.com/recaptcha/api.js" });
  if (s.path === "/") t.push({ name: "Cloudflare", category: "CDN", confidence: "High", signal: "Cloudflare response headers (header)", evidence: "Response header: cf-ray: 8a1b2c3d4e5f-AMS" });
  return t;
}

function build(s: Spec): PageData {
  const url = full(s.path);
  const parentUrl = s.depth === 0 ? null : full(s.parent ?? "/");
  if (s.status && s.status >= 400) return emptyPage(url, s.depth, parentUrl, { status: s.status, responseMs: 120 + (hash(s.path) % 80), contentType: "text/html" });
  const mkLink = (p: string, area: LinkArea, text: string): LinkRef => ({ url: full(p), text, area, internal: true, nofollow: false });
  const label = (p: string) => (p === "/" ? "Home" : p.split("/").filter(Boolean).pop()!.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()));
  const links: LinkRef[] = [
    ...NAV.filter((p) => p !== s.path).map((p) => mkLink(p, "nav", label(p))),
    ...(s.links ?? []).map((p) => mkLink(p, "main", s.ctas?.[0] && p === "/signup" ? s.ctas[0] : label(p))),
    ...FOOT.filter((p) => p !== s.path).map((p) => mkLink(p, "footer", label(p))),
    ...FOOT_EXT.map((u): LinkRef => ({ url: u, text: new URL(u).hostname.replace("www.", ""), area: "footer", internal: false, nofollow: false })),
    ...(s.ext ?? []).map((u): LinkRef => ({ url: u, text: "Read more", area: "main", internal: false, nofollow: false })),
  ];
  const heads = [...(s.h1 ? [{ level: 1, text: s.h1 }] : []), ...(s.h2 ?? []).map((t, i) => ({ level: 2, text: t })), ...(s.words > 800 ? [{ level: 4, text: "Notes" }] : [])];
  const n = s.images ?? 0;
  const images = Array.from({ length: n }, (_, i) => ({ src: `${SITE}/img/${s.path.replace(/\W+/g, "-")}-${i}.webp`, alt: i < (s.missingAlt ?? 0) ? null : `Illustration ${i + 1}`, hasDimensions: i % 3 !== 2, lazy: i > 1 }));
  const h = hash(s.path);
  return emptyPage(url, s.depth, parentUrl, {
    status: 200,
    contentType: "text/html",
    responseMs: 140 + (h % 520) + (s.path === "/docs/api-reference" ? 1300 : 0),
    htmlBytes: 28_000 + (h % 90_000) + s.words * 8,
    compressed: s.path !== "/privacy",
    title: s.title,
    description: s.desc ?? null,
    canonical: s.noCanonical ? null : url,
    lang: s.path === "/privacy" ? null : "en",
    favicon: `${SITE}/favicon.ico`,
    viewport: "width=device-width, initial-scale=1",
    robotsMeta: s.path === "/login" ? "noindex, nofollow" : null,
    og: s.desc ? { "og:title": s.title ?? "", "og:description": s.desc, "og:type": s.path.startsWith("/blog/") ? "article" : "website", "og:image": `${SITE}/og/default.png` } : {},
    twitter: s.desc ? { "twitter:card": "summary_large_image" } : {},
    jsonLd: s.ld ?? [],
    headings: heads,
    images,
    links,
    forms: [
      ...(s.contactForm ? [{ action: `${SITE}/api/contact`, method: "post", fields: 4, labeled: 3, hasPassword: false, hasEmail: true, text: "Send message" }] : []),
      ...(s.login ? [{ action: `${SITE}/api/auth/${s.path.slice(1)}`, method: "post", fields: s.path === "/signup" ? 3 : 2, labeled: s.path === "/signup" ? 3 : 2, hasPassword: true, hasEmail: true, text: s.ctas?.[0] ?? "Submit" }] : []),
      ...(s.email && !s.login ? [{ action: `${SITE}/api/newsletter`, method: "post", fields: 1, labeled: 1, hasPassword: false, hasEmail: true, text: "Subscribe" }] : []),
    ],
    buttons: [{ text: "Menu", labelled: true }, ...(s.path === "/blog" ? [{ text: "", labelled: false }] : []), ...(s.ctas ?? []).map((t) => ({ text: t, labelled: true }))],
    scripts: [
      { src: `${SITE}/_next/static/chunks/main.js`, async: false, defer: true, module: false, inHead: true },
      { src: `${SITE}/_next/static/chunks/framework.js`, async: false, defer: true, module: false, inHead: true },
      { src: "https://www.googletagmanager.com/gtag/js?id=G-DEMO", async: true, defer: false, module: false, inHead: true },
      ...(s.stripe ? [{ src: "https://js.stripe.com/v3/", async: false, defer: false, module: false, inHead: true }] : []),
      ...(s.path === "/docs/api-reference" ? [{ src: `${SITE}/vendor/swagger.js`, async: false, defer: false, module: false, inHead: true }] : []),
    ],
    inlineScripts: 3,
    styles: [{ href: `${SITE}/_next/static/css/app.css`, blocking: true }, { href: "https://fonts.googleapis.com/css2?family=Inter", blocking: true }],
    fontRefs: ["https://fonts.googleapis.com/css2?family=Inter", "https://fonts.gstatic.com/s/inter/v12/inter.woff2"],
    iframes: s.path === "/" ? ["https://www.youtube.com/embed/demo"] : [],
    videos: s.path === "/" ? 1 : 0,
    landmarks: { main: s.path === "/privacy" ? 0 : 1, nav: 1, header: 1, footer: 1, aside: s.path.startsWith("/docs") ? 1 : 0 },
    wordCount: s.words,
    textHash: s.words >= 30 ? `demo-${s.path}` : null,
    blocks: (s.blocks ?? []).map((text) => ({ text, cite: text.includes("Google SRE") ? "sre.google" : null })),
    ctas: s.ctas ?? [],
    resources: [
      { url: "https://fonts.gstatic.com", kind: "preconnect" },
      ...(s.path === "/" || s.path.startsWith("/products") ? [{ url: `${SITE}/api/stats`, kind: "api" as const }] : []),
      ...(s.path === "/blog" ? [{ url: `${SITE}/blog/rss.xml`, kind: "feed" as const }] : []),
    ],
    tech: techFor(s),
  });
}

const g = globalThis as typeof globalThis & { __demoReport?: TraceReport };

export async function buildDemoReport(): Promise<TraceReport> {
  if (g.__demoReport) return g.__demoReport;
  const pages = SPECS.map(build);
  const report = await buildReport({
    id: "demo",
    demo: true,
    startUrl: SITE + "/",
    siteHost: "lumen.example",
    pages,
    policy: { robotsFound: true, robotsStatus: 200, sitemaps: [SITE + "/sitemap.xml"], sitemapUrlCount: 27, crawlDelaySec: null, disallowRules: 2, blockedPaths: ["/admin", "/internal/reports"], summary: "robots.txt detected with 2 disallow rules applying to TraceBot. 2 discovered URLs were skipped." },
    notes: { requestedPages: 25, analyzedPages: pages.length, partial: false, stopReason: null, jsShellPages: 0, jsRenderingNote: null, errors: [], unvisitedCount: 0, sitemapNotCrawled: [SITE + "/changelog", SITE + "/customers", SITE + "/security"] },
    favicon: null,
    durationMs: 8421,
    settings: DEFAULT_SETTINGS,
    createdAt: "2025-01-15T10:00:00.000Z",
  });
  g.__demoReport = report;
  return report;
}
