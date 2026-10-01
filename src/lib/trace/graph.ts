import type { AssetRec, DomainInfo, FormRec, GraphData, GraphEdge, GraphNode, LinkArea, PageData, PageReport, ResourceRec } from "./types";
import { normalizeUrl, siteKey } from "./security";

export function urlKey(url: string): string {
  try {
    const u = normalizeUrl(new URL(url));
    return siteKey(u.hostname) + u.pathname + u.search;
  } catch {
    return url;
  }
}

export interface Adj {
  to: string;
  count: number;
  area: LinkArea;
  text: string;
  contextual: boolean; // appears in body content (not only site-wide chrome)
}

const AREA_RANK: Record<LinkArea, number> = { nav: 0, header: 1, main: 2, other: 3, footer: 4 };

/** Directed page→page adjacency derived from real anchors. */
export function buildAdjacency(pages: PageData[], idOf: (url: string) => string | undefined, ids: string[]): Map<string, Adj[]> {
  const out = new Map<string, Adj[]>();
  pages.forEach((p, i) => {
    const self = ids[i];
    const m = new Map<string, Adj>();
    for (const l of p.links) {
      if (!l.internal) continue;
      const t = idOf(l.url);
      if (!t || t === self) continue;
      const cur = m.get(t);
      const ctxual = l.area === "main" || l.area === "other";
      if (!cur) m.set(t, { to: t, count: 1, area: l.area, text: l.text, contextual: ctxual });
      else {
        cur.count++;
        if (ctxual) cur.contextual = true;
        if (AREA_RANK[l.area] < AREA_RANK[cur.area]) {
          cur.area = l.area;
          if (l.text) cur.text = l.text;
        } else if (!cur.text && l.text) cur.text = l.text;
      }
    }
    out.set(self, [...m.values()]);
  });
  return out;
}

export function buildGraph(
  pages: PageReport[],
  adj: Map<string, Adj[]>,
  assets: AssetRec[],
  forms: FormRec[],
  resources: ResourceRec[],
  sources: DomainInfo[],
): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const homeId = pages[0]?.id ?? "";
  // Domains/assets present on most pages are drawn once from the start page, not once per page.
  const isSitewide = (n: number) => pages.length >= 4 && n >= Math.max(4, Math.ceil(pages.length * 0.6));
  for (const p of pages) {
    nodes.push({
      id: p.id,
      kind: "page",
      label: p.path === "/" ? "/" : p.path.length > 28 ? p.path.slice(0, 27) + "…" : p.path,
      sub: p.title ?? undefined,
      pageId: p.id,
      pageType: p.type,
      section: p.section,
      depth: p.depth,
      weight: 1 + p.incoming.length,
      category: p.broken ? "broken" : undefined,
    });
  }
  for (const [src, list] of adj) {
    for (const a of list) {
      edges.push({ id: `${src}>${a.to}`, source: src, target: a.to, kind: a.contextual ? "link" : "nav", count: a.count });
    }
  }
  // External domains (link-referenced, top 30)
  const extByLinks = sources.filter((d) => d.kinds.includes("link")).slice(0, 30);
  for (const d of extByLinks) {
    const id = "x:" + d.domain;
    const sitewide = isSitewide(d.pageIds.length);
    nodes.push({ id, kind: "external", label: d.domain, sub: `${d.category} · ${d.pageIds.length} page${d.pageIds.length === 1 ? "" : "s"}${sitewide ? " (site-wide)" : ""}`, category: d.category, weight: d.pageIds.length + 1 });
    for (const pid of sitewide ? [homeId] : d.pageIds) edges.push({ id: `${pid}>${id}`, source: pid, target: id, kind: "external", count: d.pageIds.length });
  }
  // Assets: most-shared scripts/styles/fonts
  const assetMap = new Map<string, { type: string; pages: Set<string> }>();
  for (const a of assets) {
    if (a.type === "image" || a.type === "iframe") continue;
    const e = assetMap.get(a.url) ?? { type: a.type, pages: new Set<string>() };
    e.pages.add(a.pageId);
    assetMap.set(a.url, e);
  }
  const topAssets = [...assetMap.entries()].sort((a, b) => b[1].pages.size - a[1].pages.size).slice(0, 12);
  for (const [url, e] of topAssets) {
    const id = "a:" + url;
    let label = url;
    try {
      const u = new URL(url);
      label = (u.pathname.split("/").filter(Boolean).pop() || u.hostname).slice(0, 26);
    } catch {}
    nodes.push({ id, kind: "asset", label, sub: url, category: e.type, weight: e.pages.size });
    for (const pid of isSitewide(e.pages.size) ? [homeId] : e.pages) edges.push({ id: `${pid}>${id}`, source: pid, target: id, kind: "asset", count: e.pages.size });
  }
  // Forms
  forms.slice(0, 30).forEach((f, i) => {
    const id = `f:${f.pageId}:${i}`;
    let label = "form";
    try {
      label = new URL(f.action).pathname || "form";
    } catch {}
    nodes.push({ id, kind: "form", label: label.slice(0, 26), sub: `${f.method.toUpperCase()} · ${f.fields} field${f.fields === 1 ? "" : "s"}${f.hasPassword ? " · password" : ""}`, weight: 1, pageId: f.pageId });
    edges.push({ id: `${f.pageId}>${id}`, source: f.pageId, target: id, kind: "form", count: 1 });
  });
  // Resources
  const resMap = new Map<string, { kind: string; pages: Set<string> }>();
  for (const r of resources) {
    if (r.kind === "preconnect" || r.kind === "form-action") continue;
    const e = resMap.get(r.url) ?? { kind: r.kind, pages: new Set<string>() };
    e.pages.add(r.pageId);
    resMap.set(r.url, e);
  }
  for (const [url, e] of [...resMap.entries()].slice(0, 15)) {
    const id = "r:" + url;
    let label = url;
    try {
      const u = new URL(url);
      label = u.pathname.length > 1 ? u.pathname : u.hostname;
    } catch {}
    nodes.push({ id, kind: "resource", label: label.slice(0, 28), sub: `${e.kind} · ${url}`, category: e.kind, weight: e.pages.size });
    for (const pid of isSitewide(e.pages.size) ? [homeId] : e.pages) edges.push({ id: `${pid}>${id}`, source: pid, target: id, kind: "resource", count: e.pages.size });
  }
  return { nodes, edges };
}
