import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "./types";

export type LayoutKind = "hierarchy" | "force" | "radial" | "sections";
export type Pos = { x: number; y: number };

export function radiusOf(n: GraphNode): number {
  if (n.kind === "page") return 7 + Math.min(10, Math.sqrt(n.weight) * 2.2);
  if (n.kind === "external") return 6 + Math.min(6, Math.sqrt(n.weight) * 1.4);
  return 6;
}

const ROW = 130;
const COL = 120;

/** Leaf-ordered tree layout. Returns unit x (leaf index) per page node. */
function treeX(pages: GraphNode[], parentOf: Map<string, string>): Map<string, number> {
  const ids = new Set(pages.map((p) => p.id));
  const kids = new Map<string, string[]>();
  const roots: GraphNode[] = [];
  const nearestVisibleParent = (id: string): string | null => {
    let p = parentOf.get(id);
    let guard = 0;
    while (p && !ids.has(p) && guard++ < 50) p = parentOf.get(p);
    return p && ids.has(p) ? p : null;
  };
  const sorted = [...pages].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0) || (a.section ?? "").localeCompare(b.section ?? "") || a.label.localeCompare(b.label));
  for (const n of sorted) {
    const p = nearestVisibleParent(n.id);
    if (p && p !== n.id) {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p)!.push(n.id);
    } else roots.push(n);
  }
  const xs = new Map<string, number>();
  let leaf = 0;
  const seen = new Set<string>();
  const visit = (id: string): number => {
    if (seen.has(id)) return xs.get(id) ?? 0;
    seen.add(id);
    const ch = kids.get(id) ?? [];
    if (!ch.length) {
      xs.set(id, leaf++);
      return xs.get(id)!;
    }
    const cx = ch.map(visit);
    const x = (Math.min(...cx) + Math.max(...cx)) / 2;
    xs.set(id, x);
    return x;
  };
  for (const r of roots) visit(r.id);
  return xs;
}

function sweep(items: { id: string; v: number }[], gap: number): Map<string, number> {
  const out = new Map<string, number>();
  const s = [...items].sort((a, b) => a.v - b.v);
  let last = -Infinity;
  for (const it of s) {
    const v = Math.max(it.v, last + gap);
    out.set(it.id, v);
    last = v;
  }
  // recentre sweep around original mean
  const mean0 = s.reduce((a, b) => a + b.v, 0) / Math.max(1, s.length);
  const mean1 = [...out.values()].reduce((a, b) => a + b, 0) / Math.max(1, out.size);
  for (const [k, v] of out) out.set(k, v - (mean1 - mean0));
  return out;
}

const NONPAGE_ORDER = ["external", "form", "resource", "asset"] as const;

export function computeLayout(nodes: GraphNode[], edges: GraphEdge[], kind: LayoutKind, parentOf: Map<string, string>): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  const pages = nodes.filter((n) => n.kind === "page");
  const others = nodes.filter((n) => n.kind !== "page");
  const nbrs = new Map<string, string[]>();
  for (const e of edges) {
    (nbrs.get(e.source) ?? nbrs.set(e.source, []).get(e.source)!).push(e.target);
    (nbrs.get(e.target) ?? nbrs.set(e.target, []).get(e.target)!).push(e.source);
  }
  const maxDepth = Math.max(0, ...pages.map((p) => p.depth ?? 0));
  const xs = treeX(pages, parentOf);

  const hierarchy = () => {
    for (const p of pages) pos.set(p.id, { x: (xs.get(p.id) ?? 0) * COL, y: (p.depth ?? 0) * ROW });
    const pageX = (id: string) => pos.get(id)?.x;
    let row = maxDepth + 1.5;
    for (const k of NONPAGE_ORDER) {
      const group = others.filter((o) => o.kind === k);
      if (!group.length) continue;
      const items = group.map((o) => {
        const ns = (nbrs.get(o.id) ?? []).map(pageX).filter((v): v is number => v !== undefined);
        return { id: o.id, v: ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0 };
      });
      const placed = sweep(items, 96);
      for (const [id, x] of placed) pos.set(id, { x, y: row * ROW });
      row += 0.9;
    }
  };

  const polar = (r: number, a: number): Pos => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  const circMean = (angles: number[]) => Math.atan2(angles.reduce((a, b) => a + Math.sin(b), 0), angles.reduce((a, b) => a + Math.cos(b), 0));

  const placeOuter = (baseRadius: number) => {
    const angleOf = (id: string) => {
      const p = pos.get(id);
      return p ? Math.atan2(p.y, p.x) : undefined;
    };
    let ring = baseRadius;
    for (const k of NONPAGE_ORDER) {
      const group = others.filter((o) => o.kind === k);
      if (!group.length) continue;
      const items = group.map((o) => {
        const as = (nbrs.get(o.id) ?? []).map(angleOf).filter((v): v is number => v !== undefined);
        return { id: o.id, v: as.length ? circMean(as) : 0 };
      });
      // sweep on unwrapped angle with min gap proportional to radius
      const gap = 80 / ring;
      const placed = sweep(items.map((i) => ({ id: i.id, v: i.v + Math.PI })), gap);
      for (const [id, a] of placed) pos.set(id, polar(ring, a - Math.PI));
      ring += 70;
    }
  };

  const radial = () => {
    const leaves = Math.max(1, Math.max(0, ...xs.values()) + 1);
    const R = 150;
    for (const p of pages) {
      const d = p.depth ?? 0;
      if (d === 0 && pages.length > 0 && (xs.size === 0 || p.depth === 0)) {
        pos.set(p.id, { x: 0, y: 0 });
        continue;
      }
      const a = ((xs.get(p.id) ?? 0) / leaves) * Math.PI * 2 - Math.PI / 2;
      pos.set(p.id, polar(d * R + Math.max(0, pages.length - 30) * 1.5, a));
    }
    placeOuter((maxDepth + 1.4) * R + Math.max(0, pages.length - 30) * 1.5);
  };

  const sections = () => {
    const groups = new Map<string, GraphNode[]>();
    for (const p of pages) (groups.get(p.section ?? "") ?? groups.set(p.section ?? "", []).get(p.section ?? "")!).push(p);
    const keys = [...groups.keys()];
    const maxN = Math.max(1, ...[...groups.values()].map((g) => g.length));
    const clusterR = (n: number) => 36 + Math.sqrt(n) * 34;
    const R = keys.length <= 1 ? 0 : Math.max(260, keys.length * (clusterR(maxN) * 0.95));
    keys.forEach((k, i) => {
      const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
      const c = polar(R, a);
      const g = groups.get(k)!.sort((x, y) => (x.depth ?? 0) - (y.depth ?? 0) || x.label.localeCompare(y.label));
      g.forEach((p, j) => {
        if (j === 0) return pos.set(p.id, { x: c.x, y: c.y });
        const r = 34 * Math.sqrt(j) + 14;
        const ang = j * 2.39996;
        pos.set(p.id, { x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r });
      });
    });
    placeOuter(R + clusterR(maxN) + 140);
  };

  const force = () => {
    hierarchy();
    type N = SimulationNodeDatum & { id: string; r: number };
    const sn: N[] = nodes.map((n, i) => {
      const p = pos.get(n.id) ?? { x: 0, y: 0 };
      return { id: n.id, r: radiusOf(n), x: p.x * 0.6 + ((i * 37) % 11) - 5, y: p.y * 0.6 + ((i * 53) % 13) - 6 };
    });
    const idx = new Map(sn.map((n) => [n.id, n]));
    const links: SimulationLinkDatum<N>[] = edges.filter((e) => idx.has(e.source) && idx.has(e.target)).map((e) => ({ source: idx.get(e.source)!, target: idx.get(e.target)! }));
    const sim = forceSimulation(sn)
      .force("link", forceLink<N, SimulationLinkDatum<N>>(links).distance(80).strength(0.35))
      .force("charge", forceManyBody().strength(-260).distanceMax(500))
      .force("collide", forceCollide<N>().radius((d) => d.r + 16))
      .force("x", forceX(0).strength(0.04))
      .force("y", forceY(0).strength(0.04))
      .stop();
    for (let i = 0; i < 320; i++) sim.tick();
    for (const n of sn) pos.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  };

  if (kind === "hierarchy") hierarchy();
  else if (kind === "radial") radial();
  else if (kind === "sections") sections();
  else force();
  for (const n of nodes) if (!pos.has(n.id)) pos.set(n.id, { x: 0, y: 0 });
  return pos;
}
