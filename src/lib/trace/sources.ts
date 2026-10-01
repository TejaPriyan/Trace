import type { AssetRec, DomainInfo, FormRec, PageReport, ResourceRec } from "./types";
import { siteKey } from "./security";
import { categorizeDomain } from "./tech";

export function collectAssets(pages: PageReport[], siteHost: string): AssetRec[] {
  const site = siteKey(siteHost);
  const out: AssetRec[] = [];
  const add = (p: PageReport, url: string | null, type: AssetRec["type"]) => {
    if (!url || !/^https?:\/\//i.test(url)) return;
    try {
      const u = new URL(url);
      out.push({ pageId: p.id, url: u.origin + u.pathname, type, host: u.hostname, external: siteKey(u.hostname) !== site });
    } catch {}
  };
  for (const p of pages) {
    const seen = new Set<string>();
    const dedupe = (type: AssetRec["type"], url: string | null) => {
      if (!url || seen.has(type + url)) return;
      seen.add(type + url);
      add(p, url, type);
    };
    p.scripts.forEach((s) => dedupe("script", s.src));
    p.styles.forEach((s) => dedupe("style", s.href));
    p.images.forEach((i) => dedupe("image", i.src));
    p.fontRefs.forEach((f) => dedupe("font", f));
    p.iframes.forEach((f) => dedupe("iframe", f));
  }
  return out;
}

export function collectForms(pages: PageReport[]): FormRec[] {
  return pages.flatMap((p) => p.forms.map((f) => ({ ...f, pageId: p.id })));
}
export function collectResources(pages: PageReport[]): ResourceRec[] {
  return pages.flatMap((p) => p.resources.map((r) => ({ ...r, pageId: p.id })));
}

export function collectSources(pages: PageReport[], assets: AssetRec[], resources: ResourceRec[], siteHost: string): DomainInfo[] {
  const site = siteKey(siteHost);
  const map = new Map<string, { refs: number; kinds: Set<string>; pages: Set<string>; samples: Set<string> }>();
  const hit = (domain: string, kind: string, pageId: string, sample: string) => {
    const d = siteKey(domain);
    if (d === site) return;
    const e = map.get(d) ?? { refs: 0, kinds: new Set<string>(), pages: new Set<string>(), samples: new Set<string>() };
    e.refs++;
    e.kinds.add(kind);
    e.pages.add(pageId);
    if (e.samples.size < 6) e.samples.add(sample);
    map.set(d, e);
  };
  for (const p of pages) {
    for (const l of p.links) {
      if (l.internal) continue;
      try {
        const u = new URL(l.url);
        hit(u.hostname, "link", p.id, u.origin + u.pathname);
      } catch {}
    }
  }
  for (const a of assets) if (a.external) hit(a.host, a.type, a.pageId, a.url);
  for (const r of resources) {
    if (r.kind !== "preconnect") continue;
    try {
      const u = new URL(r.url);
      hit(u.hostname, "preconnect", r.pageId, u.origin);
    } catch {}
  }
  return [...map.entries()]
    .map(([domain, e]) => {
      const kinds = [...e.kinds];
      return {
        domain,
        category: categorizeDomain(domain, kinds),
        refs: e.refs,
        kinds,
        pageIds: [...e.pages],
        samples: [...e.samples],
        subdomain: domain.endsWith("." + site),
      };
    })
    .sort((a, b) => b.pageIds.length - a.pageIds.length || b.refs - a.refs);
}
