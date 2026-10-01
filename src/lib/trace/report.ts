import type {
  ContentSummary,
  CrawlNotes,
  CrawlPolicy,
  CrawlSettings,
  Identity,
  PageData,
  PageReport,
  PageType,
  Phase,
  TechCategory,
  TechDetection,
  TraceReport,
} from "./types";
import { PAGE_TYPES, TECH_CATEGORIES } from "./types";
import { classifyPage, inferSections } from "./classify";
import { buildAdjacency, buildGraph, urlKey } from "./graph";
import { inferJourneys } from "./journeys";
import { extractClaims } from "./claims";
import { buildFindings, buildMissed } from "./findings";
import { a11ySignals, contentScore, isOkPage, perfSignals, scoreFrom, seoSignals, structureScore } from "./signals";
import { collectAssets, collectForms, collectResources, collectSources } from "./sources";

export interface BuildInput {
  id: string;
  demo: boolean;
  startUrl: string;
  siteHost: string;
  pages: PageData[];
  policy: CrawlPolicy;
  notes: CrawlNotes;
  favicon: { url: string; accessible: boolean | null } | null;
  durationMs: number;
  settings: CrawlSettings;
  createdAt?: string;
}

const tick = () => new Promise<void>((r) => setImmediate(r));
const CONF_RANK = { High: 3, Medium: 2, Low: 1 } as const;

export async function buildReport(input: BuildInput, onPhase?: (p: Phase) => void): Promise<TraceReport> {
  onPhase?.("analyzing");
  await tick();
  const sorted = [...input.pages].sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  const ids = sorted.map((_, i) => `p${i}`);
  const keyToId = new Map<string, string>();
  sorted.forEach((p, i) => {
    keyToId.set(urlKey(p.url), ids[i]);
    if (p.redirectedFrom) keyToId.set(urlKey(p.redirectedFrom), ids[i]);
  });
  const idOf = (u: string) => keyToId.get(urlKey(u));
  const adj = buildAdjacency(sorted, idOf, ids);

  const home = sorted[0];
  const navTargets = new Set<string>();
  for (const l of home?.links ?? []) {
    if (l.internal && (l.area === "nav" || l.area === "header")) {
      const t = idOf(l.url);
      if (t) navTargets.add(t);
    }
  }
  const navDetected = navTargets.size > 0;
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [from, list] of adj) for (const e of list) incoming.get(e.to)?.push(from);

  const pages: PageReport[] = sorted.map((p, i) => {
    const id = ids[i];
    const cls = classifyPage(p);
    const inc = incoming.get(id) ?? [];
    const out = (adj.get(id) ?? []).map((e) => e.to);
    const okPage = p.status !== null && p.status >= 200 && p.status < 400;
    return {
      ...p,
      id,
      type: cls.type,
      typeBasis: cls.basis,
      section: "",
      incoming: inc,
      outgoing: out,
      internalLinkCount: p.links.filter((l) => l.internal).length,
      externalLinkCount: p.links.filter((l) => !l.internal).length,
      inPrimaryNav: navTargets.has(id),
      orphanLike: okPage && p.depth > 0 && !navTargets.has(id) && inc.length <= 1,
      techNames: [...new Set(p.tech.map((t) => t.name))],
      broken: p.status === null || p.status >= 400,
    };
  });
  const { sections, map: secMap } = inferSections(pages.map((p) => ({ id: p.id, path: p.path, type: p.type })));
  for (const p of pages) p.section = secMap.get(p.id) ?? "";

  // Technologies
  const techMap = new Map<string, TechDetection>();
  for (const p of pages) {
    for (const t of p.tech) {
      const e = techMap.get(t.name) ?? { name: t.name, category: t.category, confidence: t.confidence, signals: [], pageIds: [] };
      if (CONF_RANK[t.confidence] > CONF_RANK[e.confidence]) e.confidence = t.confidence;
      if (!e.signals.some((s) => s.signal === t.signal) && e.signals.length < 6) e.signals.push({ signal: t.signal, evidence: t.evidence });
      if (!e.pageIds.includes(p.id)) e.pageIds.push(p.id);
      techMap.set(t.name, e);
    }
  }
  const technologies = [...techMap.values()];
  for (const t of technologies) if (t.confidence === "Medium" && t.signals.length >= 2) t.confidence = "High";
  technologies.sort((a, b) => TECH_CATEGORIES.indexOf(a.category as TechCategory) - TECH_CATEGORIES.indexOf(b.category as TechCategory) || CONF_RANK[b.confidence] - CONF_RANK[a.confidence] || b.pageIds.length - a.pageIds.length);

  const ok = pages.filter(isOkPage);
  const assets = collectAssets(pages, input.siteHost);
  const forms = collectForms(pages);
  const resources = collectResources(pages);
  const sources = collectSources(pages, assets, resources, input.siteHost);

  const seo = seoSignals(pages, input.policy, input.notes);
  const a11y = a11ySignals(pages);
  const perf = perfSignals(pages);
  const scores = [
    structureScore(pages, navDetected),
    contentScore(pages),
    scoreFrom("seo", "SEO SIGNALS", seo.checks, Math.max(1, ok.length)),
    scoreFrom("a11y", "ACCESSIBILITY SIGNALS", a11y.checks, Math.max(1, ok.length)),
    scoreFrom("perf", "PERFORMANCE SIGNALS", perf.checks, Math.max(1, ok.length)),
  ];

  onPhase?.("mapping");
  await tick();
  const graph = buildGraph(pages, adj, assets, forms, resources, sources);

  // Content summary
  const typeCount = new Map<PageType, number>();
  for (const p of ok) typeCount.set(p.type, (typeCount.get(p.type) ?? 0) + 1);
  const ctaMap = new Map<string, Set<string>>();
  for (const p of ok) for (const c of p.ctas) ctaMap.set(c, (ctaMap.get(c) ?? new Set()).add(p.id));
  const blockMap = new Map<string, Set<string>>();
  for (const p of ok) for (const b of p.blocks) blockMap.set(b.text, (blockMap.get(b.text) ?? new Set()).add(p.id));
  const navLinks = new Map<string, { label: string; ids: Set<string> }>();
  for (const p of ok)
    for (const l of p.links) {
      if (!l.internal || (l.area !== "nav" && l.area !== "header")) continue;
      const k = urlKey(l.url);
      const e = navLinks.get(k) ?? { label: l.text || l.url, ids: new Set<string>() };
      e.ids.add(p.id);
      if (!e.label && l.text) e.label = l.text;
      navLinks.set(k, e);
    }
  const content: ContentSummary = {
    typeCounts: PAGE_TYPES.map((type) => ({ type, count: typeCount.get(type) ?? 0 })).filter((x) => x.count > 0),
    totalWords: ok.reduce((a, p) => a + p.wordCount, 0),
    avgWords: ok.length ? Math.round(ok.reduce((a, p) => a + p.wordCount, 0) / ok.length) : 0,
    thinPages: ok.filter((p) => p.wordCount < 150).map((p) => p.id),
    images: ok.reduce((a, p) => a + p.images.length, 0),
    videos: ok.reduce((a, p) => a + p.videos, 0),
    audios: ok.reduce((a, p) => a + p.audios, 0),
    iframes: ok.reduce((a, p) => a + p.iframes.length, 0),
    ctas: [...ctaMap.entries()].map(([text, s]) => ({ text, count: s.size, pageIds: [...s] })).sort((a, b) => b.count - a.count).slice(0, 12),
    nav: [...navLinks.entries()]
      .map(([k, e]) => ({ label: e.label.slice(0, 40), url: k, pageId: keyToId.get(k) ?? null, share: e.ids.size / Math.max(1, ok.length) }))
      .sort((a, b) => b.share - a.share)
      .slice(0, 14),
    repeated: [...blockMap.entries()].filter(([, s]) => s.size >= 2).map(([text, s]) => ({ text, count: s.size, pageIds: [...s] })).sort((a, b) => b.count - a.count).slice(0, 10),
    headingSamples: ok.slice(0, 14).map((p) => ({ pageId: p.id, h1: p.headings.find((h) => h.level === 1)?.text ?? null, h2: p.headings.filter((h) => h.level === 2 && h.text).slice(0, 4).map((h) => h.text) })),
  };

  onPhase?.("tracing");
  await tick();
  const journeys = inferJourneys(pages, adj);
  const claims = extractClaims(pages);
  const ctx = { pages, sections, adj, sources, technologies, content, policy: input.policy, notes: input.notes, hostname: input.siteHost, startUrl: input.startUrl, navDetected };
  const findings = buildFindings(ctx);
  const missed = buildMissed(ctx);

  onPhase?.("reporting");
  await tick();
  const h = home;
  const identity: Identity = {
    title: h?.title ?? null,
    description: h?.description ?? null,
    canonical: h?.canonical ?? null,
    lang: h?.lang ?? null,
    favicon: input.favicon,
    og: h?.og ?? {},
    twitter: h?.twitter ?? {},
  };
  return {
    id: input.id,
    demo: input.demo,
    url: input.startUrl,
    hostname: input.siteHost.replace(/^www\./, ""),
    createdAt: input.createdAt ?? new Date().toISOString(),
    durationMs: input.durationMs,
    settings: input.settings,
    policy: input.policy,
    notes: input.notes,
    identity,
    stats: {
      pages: pages.length,
      sections: sections.length,
      internalLinks: pages.reduce((a, p) => a + p.internalLinkCount, 0),
      externalLinks: pages.reduce((a, p) => a + p.externalLinkCount, 0),
      assets: assets.length,
      forms: forms.length,
      techSignals: technologies.length,
      journeys: journeys.length,
      findings: findings.length,
      brokenPages: pages.filter((p) => p.broken).length,
      maxDepth: Math.max(0, ...pages.map((p) => p.depth)),
      externalDomains: sources.length,
      claims: claims.length,
      resources: resources.length,
    },
    pages,
    sections,
    graph,
    technologies,
    content,
    seo,
    a11y,
    perf,
    scores,
    findings,
    missed,
    journeys,
    claims,
    sources,
    assets,
    forms,
    resources,
  };
}
