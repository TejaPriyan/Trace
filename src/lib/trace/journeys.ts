import type { Confidence, Journey, JourneyStep, PageReport, PageType } from "./types";
import type { Adj } from "./graph";

const AREA_CONF: Record<string, number> = { nav: 3, header: 3, main: 2, other: 1, footer: 1 };

function shortestPath(adj: Map<string, Adj[]>, from: string, to: string): string[] | null {
  if (from === to) return [from];
  const prev = new Map<string, string>();
  const q = [from];
  const seen = new Set([from]);
  while (q.length) {
    const cur = q.shift()!;
    for (const e of adj.get(cur) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, cur);
      if (e.to === to) {
        const path = [to];
        let c = to;
        while (prev.has(c)) {
          c = prev.get(c)!;
          path.unshift(c);
        }
        return path;
      }
      q.push(e.to);
    }
  }
  return null;
}

export function inferJourneys(pages: PageReport[], adj: Map<string, Adj[]>): Journey[] {
  const ok = pages.filter((p) => p.status !== null && p.status < 400);
  const home = ok.find((p) => p.type === "Home") ?? ok[0];
  if (!home) return [];
  const byId = new Map(pages.map((p) => [p.id, p]));
  const pick = (...types: PageType[]) => {
    const c = ok.filter((p) => types.includes(p.type) && p.id !== home.id);
    c.sort((a, b) => a.depth - b.depth || b.incoming.length - a.incoming.length);
    return c[0];
  };
  const label = (p: PageReport) => (p.type !== "Unknown" && p.type !== "Home" ? p.type.toUpperCase() : p.type === "Home" ? "HOME" : "PAGE");
  const pageStep = (p: PageReport, note?: string): JourneyStep => ({ label: `${label(p)} · ${p.path}`, pageId: p.id, note });

  const build = (id: string, name: string, waypoints: (PageReport | undefined)[], opts: { minStops: number; form?: "any" | "email" }): Journey | null => {
    const chain: PageReport[] = [home];
    let minArea = 3;
    let hops = 0;
    for (const w of waypoints) {
      if (!w) continue;
      const last = chain[chain.length - 1];
      const path = shortestPath(adj, last.id, w.id);
      if (!path || path.length < 2) continue;
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1];
        const to = path[i];
        const edge = (adj.get(from) ?? []).find((e) => e.to === to);
        if (edge) {
          minArea = Math.min(minArea, AREA_CONF[edge.area] ?? 1);
          hops++;
        }
        const pg = byId.get(to);
        if (pg) chain.push(pg);
      }
    }
    const stops = new Set(chain.map((c) => c.id));
    if (stops.size < opts.minStops) return null;
    const steps: JourneyStep[] = chain.map((p, i) => {
      if (i === 0) return pageStep(p);
      const edge = (adj.get(chain[i - 1].id) ?? []).find((e) => e.to === p.id);
      return pageStep(p, edge ? `via ${edge.text ? `“${edge.text.slice(0, 40)}”` : "link"} (${edge.area})` : undefined);
    });
    const lastPage = chain[chain.length - 1];
    const form = lastPage.forms.find((f) => (opts.form === "email" ? f.hasEmail : true));
    if (opts.form && form) steps.push({ label: `FORM · ${form.fields} field${form.fields === 1 ? "" : "s"}${form.hasPassword ? " incl. password" : ""}`, pageId: null, note: `on ${lastPage.path}` });
    const confidence: Confidence = minArea >= 3 ? "High" : minArea === 2 ? "Medium" : "Low";
    return {
      id,
      name,
      confidence,
      steps,
      basis: `Inferred from navigation and link relationships: ${hops} real link hop${hops === 1 ? "" : "s"}, shortest path through the crawled link graph between pages classified by path/metadata heuristics.`,
    };
  };

  const out: (Journey | null)[] = [];
  out.push(build("j-customer", "CUSTOMER JOURNEY", [pick("Product"), pick("Pricing"), pick("Signup", "Checkout")], { minStops: 3 }));
  const blog = pick("Blog");
  const articles = ok.filter((p) => p.type === "Article").sort((a, b) => a.depth - b.depth || b.incoming.length - a.incoming.length);
  const a1 = articles[0];
  const a2 = a1 ? articles.find((x) => x.id !== a1.id && (adj.get(a1.id) ?? []).some((e) => e.to === x.id)) : undefined;
  const emailPage = ok.find((p) => p.forms.some((f) => f.hasEmail));
  out.push(build("j-content", "CONTENT JOURNEY", [blog, a1, a2, emailPage && emailPage.id !== a1?.id ? emailPage : undefined], { minStops: 3, form: "email" }));
  const contact = pick("Contact");
  out.push(build("j-contact", "CONTACT JOURNEY", [pick("About"), contact], { minStops: 3, form: "any" }));
  const docs = pick("Documentation");
  const docs2 = docs ? ok.find((x) => x.type === "Documentation" && x.id !== docs.id && (adj.get(docs.id) ?? []).some((e) => e.to === x.id)) : undefined;
  out.push(build("j-docs", "DOCUMENTATION JOURNEY", [docs, docs2], { minStops: 2 }));
  out.push(build("j-account", "ACCOUNT JOURNEY", [pick("Login"), pick("Signup")], { minStops: 2, form: "any" }));
  return out.filter((j): j is Journey => !!j);
}
