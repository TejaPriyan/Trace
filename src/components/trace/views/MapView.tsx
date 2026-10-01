"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { GraphCanvas, type MapColorMode, type MapSizeMode } from "../GraphCanvas";
import { FilterBar } from "../FilterBar";
import { useTrace } from "../TraceContext";
import { Badge, Btn, Label, cx, sectionColor } from "../ui";
import type { GraphEdge, GraphNode, NodeKind } from "@/lib/trace/types";
import type { LayoutKind } from "@/lib/trace/layout";

const LAYOUTS: { key: LayoutKind; label: string }[] = [
  { key: "hierarchy", label: "Hierarchy" },
  { key: "force", label: "Force" },
  { key: "radial", label: "Radial" },
  { key: "sections", label: "Sections" },
];
const KIND_LABEL: Record<NodeKind, string> = { page: "Page", external: "External", asset: "Asset", form: "Form", resource: "Resource" };

function download(name: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function serializeSvg(svg: SVGSVGElement): string {
  const cs = getComputedStyle(document.documentElement);
  let s = new XMLSerializer().serializeToString(svg.cloneNode(true));
  s = s.replace(/var\((--[a-z0-9-]+)\)/gi, (_, n: string) => (cs.getPropertyValue(n).trim() || "#888").replace(/"/g, "'"));
  const bg = cs.getPropertyValue("--bg").trim() || "#000";
  return s.replace(/(<svg[^>]*>)/, `$1<rect width="100%" height="100%" fill="${bg}"/>`);
}

export function MapView() {
  const { report, pageById, matches, filters, selectedNode, setSelectedNode, openXray, goto } = useTrace();
  const [layout, setLayout] = useState<LayoutKind>("hierarchy");
  const [colorMode, setColorMode] = useState<MapColorMode>("section");
  const [sizeMode, setSizeMode] = useState<MapSizeMode>("default");
  const [hidden, setHidden] = useState<Set<NodeKind>>(new Set(["asset", "resource"]));
  const [showNav, setShowNav] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [centerOn, setCenterOn] = useState<{ id: string; n: number } | null>(null);
  const [focus, setFocus] = useState(false);
  const [list, setList] = useState(false);
  const [assemble, setAssemble] = useState(true);
  const [resetSignal, setReset] = useState(0);
  const [fitSignal, setFit] = useState(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (window.innerWidth < 768) setList(true);
    const t = setTimeout(() => setAssemble(false), 4500);
    return () => clearTimeout(t);
  }, []);

  const parentOf = useMemo(() => {
    const byUrl = new Map(report.pages.map((p) => [p.url, p.id]));
    const m = new Map<string, string>();
    for (const p of report.pages) {
      const par = p.parentUrl ? byUrl.get(p.parentUrl) : undefined;
      if (par && par !== p.id) m.set(p.id, par);
    }
    return m;
  }, [report]);

  const hubOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of report.sections) {
      const pages = s.pageIds.map((id) => pageById.get(id)!).filter(Boolean).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
      if (pages[0]) m.set(s.id, pages[0].id);
    }
    return m;
  }, [report, pageById]);

  const { nodes, edges } = useMemo(() => {
    const sec = (id: string) => pageById.get(id)?.section ?? "";
    const redirect = new Map<string, string>();
    const keepPage = new Set<string>();
    for (const n of report.graph.nodes) {
      if (n.kind !== "page") continue;
      const p = pageById.get(n.id);
      if (!p) continue;
      if (!matches(p)) continue;
      const s = sec(n.id);
      if (collapsed.has(s) && hubOf.get(s) !== n.id && n.id !== selectedNode) {
        redirect.set(n.id, hubOf.get(s)!);
        continue;
      }
      keepPage.add(n.id);
    }
    const hideExternal = filters.linkTypes.length > 0 && !filters.linkTypes.includes("external");
    const hideInternal = filters.linkTypes.length > 0 && !filters.linkTypes.includes("internal");
    const map = (id: string) => redirect.get(id) ?? id;
    const agg = new Map<string, GraphEdge>();
    for (const e of report.graph.edges) {
      const s = map(e.source);
      const t = map(e.target);
      if (s === t) continue;
      const sn = report.graph.nodes.find((n) => n.id === s);
      void sn;
      const key = `${s}>${t}`;
      const cur = agg.get(key);
      if (cur) cur.count += e.count;
      else agg.set(key, { ...e, id: key, source: s, target: t });
    }
    const nodeKinds = new Map(report.graph.nodes.map((n) => [n.id, n]));
    const alive = new Set<string>(keepPage);
    const candidate = [...agg.values()].filter((e) => {
      const a = nodeKinds.get(e.source);
      const b = nodeKinds.get(e.target);
      if (!a || !b) return false;
      if (a.kind === "page" && !keepPage.has(e.source)) return false;
      if (b.kind === "page" && !keepPage.has(e.target)) return false;
      if (b.kind !== "page" && (hidden.has(b.kind) || (b.kind === "external" && hideExternal))) return false;
      if (b.kind === "page" && hideInternal) return false;
      return true;
    });
    for (const e of candidate) {
      alive.add(e.source);
      alive.add(e.target);
    }
    let ns: GraphNode[] = report.graph.nodes.filter((n) => alive.has(n.id)).map((n) => {
      const hubSection = [...hubOf.entries()].find(([, h]) => h === n.id)?.[0];
      if (n.kind === "page" && hubSection && collapsed.has(hubSection)) {
        const hidden = report.sections.find((s) => s.id === hubSection)!.pageIds.length - 1;
        return { ...n, label: `${n.label} +${hidden}`, weight: n.weight + hidden };
      }
      return n;
    });
    let es = candidate.filter((e) => {
      const tree = parentOf.get(e.target) === e.source;
      if (e.kind === "nav" && !showNav && !tree && e.source !== selectedNode && e.target !== selectedNode) return false;
      return true;
    });
    if (focus && selectedNode) {
      const rel = new Set<string>([selectedNode]);
      for (const e of candidate) {
        if (e.source === selectedNode) rel.add(e.target);
        if (e.target === selectedNode) rel.add(e.source);
      }
      ns = ns.filter((n) => rel.has(n.id));
      es = candidate.filter((e) => rel.has(e.source) && rel.has(e.target));
    }
    return { nodes: ns, edges: es };
  }, [report, pageById, matches, collapsed, hubOf, hidden, filters.linkTypes, showNav, focus, selectedNode, parentOf]);

  const matchSet = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return new Set(nodes.filter((n) => n.label.toLowerCase().includes(q) || n.sub?.toLowerCase().includes(q)).map((n) => n.id));
  }, [query, nodes]);

  const selected = nodes.find((n) => n.id === selectedNode) ?? report.graph.nodes.find((n) => n.id === selectedNode) ?? null;
  const toggleKind = (k: NodeKind) => setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleSection = (id: string) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportSvg = () => svgRef.current && download(`trace-${report.hostname}-map.svg`, new Blob([serializeSvg(svgRef.current)], { type: "image/svg+xml" }));
  const exportPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = w * 2;
      c.height = h * 2;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => b && download(`trace-${report.hostname}-map.png`, b));
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializeSvg(svg));
  };

  return (
    <div className="flex h-full min-h-[480px] flex-col">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <label className="sr-only" htmlFor="map-search">Search map</label>
        <input
          id="map-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matchSet && matchSet.size) {
              const id = [...matchSet][0];
              setSelectedNode(id);
              setCenterOn({ id, n: Date.now() });
            }
          }}
          placeholder="Search map…"
          className="w-36 border border-line bg-panel px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-dim focus:border-accent"
        />
        <div className="flex" role="group" aria-label="Layout">
          {LAYOUTS.map((l) => (
            <button key={l.key} onClick={() => setLayout(l.key)} aria-pressed={layout === l.key} className={cx("border border-line px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider -ml-px first:ml-0", layout === l.key ? "border-accent bg-accent/10 text-accent z-10" : "text-mute hover:text-fg")}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-mute" role="group" aria-label="Show categories">
          {(["external", "form", "asset", "resource"] as NodeKind[]).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-1">
              <input type="checkbox" checked={!hidden.has(k)} onChange={() => toggleKind(k)} className="accent-[var(--accent)]" />
              {KIND_LABEL[k]}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-1" title="Show site-wide navigation/footer links">
            <input type="checkbox" checked={showNav} onChange={() => setShowNav(!showNav)} className="accent-[var(--accent)]" />
            Nav links
          </label>
        </div>
        <FilterBar showLinkTypes />
        <div className="flex flex-wrap items-center gap-1 border-l border-line pl-2 font-mono text-[10px] uppercase">
          <Label className="mr-0.5 text-dim">Color</Label>
          {(["section", "status", "depth"] as MapColorMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setColorMode(m)}
              className={cx("border px-1.5 py-0.5 tracking-wider transition", colorMode === m ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-fg")}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 border-l border-line pl-2 font-mono text-[10px] uppercase">
          <Label className="mr-0.5 text-dim">Size</Label>
          {(["default", "links", "words"] as MapSizeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSizeMode(m)}
              className={cx("border px-1.5 py-0.5 tracking-wider transition", sizeMode === m ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-fg")}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap gap-1.5">
          <Btn onClick={() => { setReset((n) => n + 1); setCollapsed(new Set()); setFocus(false); }}>Reset layout</Btn>
          <Btn onClick={() => setFit((n) => n + 1)}>Fit</Btn>
          <Btn onClick={() => setList(!list)}>{list ? "Map view" : "List view"}</Btn>
          {!list && <Btn onClick={exportSvg} title="Download map as SVG">SVG</Btn>}
          {!list && <Btn onClick={exportPng} title="Download map as PNG">PNG</Btn>}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-1.5 border-b border-line px-3 py-1.5" aria-label="Sections (inferred) — click to collapse">
        <Label className="mr-1">Sections</Label>
        {report.sections.map((s) => (
          <button key={s.id} onClick={() => toggleSection(s.id)} aria-pressed={collapsed.has(s.id)} title={`${s.basis} (inferred). Click to ${collapsed.has(s.id) ? "expand" : "collapse"}.`} className={cx("flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", collapsed.has(s.id) ? "border-accent text-accent" : "border-line text-mute hover:text-fg")}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: sectionColor(s.label) }} />
            {s.label} · {s.pageIds.length}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-dim">
          {nodes.length} nodes · {edges.length} edges
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        {list ? (
          <ListView selected={selectedNode} onSelect={setSelectedNode} />
        ) : nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8 text-sm text-mute">No nodes match the current filters.</div>
        ) : (
          <GraphCanvas nodes={nodes} edges={edges} layout={layout} parentOf={parentOf} selectedId={selectedNode} onSelect={setSelectedNode} matches={matchSet} assemble={assemble} resetSignal={resetSignal} fitSignal={fitSignal} centerOn={centerOn} svgRef={svgRef} colorMode={colorMode} sizeMode={sizeMode} pageById={pageById} />
        )}
        {selected && (
          <aside className="absolute inset-x-0 bottom-0 z-20 max-h-[55%] overflow-auto border-t border-line bg-panel p-4 sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-80 sm:border-l sm:border-t-0" aria-label="Node details">
            <NodePanel node={selected} focus={focus} onFocus={() => setFocus(!focus)} onClose={() => { setSelectedNode(null); setFocus(false); }} openXray={openXray} goto={goto} select={setSelectedNode} />
          </aside>
        )}
        {!list && !selected && (
          <div className="pointer-events-none absolute bottom-3 right-3 hidden border border-line bg-panel/90 p-2.5 font-mono text-[10px] uppercase tracking-wider text-mute sm:block no-print">
            <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full bg-mute" />Page</div>
            <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rotate-45 border border-fg" />External</div>
            <div className="flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 border border-dim" />Asset</div>
            <div className="flex items-center gap-2"><span className="inline-block h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent border-b-warm" />Form</div>
            <div className="mt-1 text-dim">
              Color = {colorMode === "section" ? "Inferred section" : colorMode === "status" ? "HTTP Status (green=200, amber=3xx, red=4xx/5xx)" : "Depth (accent=0, cyan=1, indigo=2, purple=3+)"}
            </div>
            {sizeMode !== "default" && <div className="text-dim">Size = {sizeMode === "links" ? "Inbound links" : "Word count"}</div>}
          </div>
        )}
      </div>

    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-0">
      <Label>{k}</Label>
      <div className="min-w-0 truncate text-right font-mono text-xs">{v}</div>
    </div>
  );
}

function NodePanel({ node, focus, onFocus, onClose, openXray, goto, select }: { node: GraphNode; focus: boolean; onFocus: () => void; onClose: () => void; openXray: (id: string) => void; goto: ReturnType<typeof useTrace>["goto"]; select: (id: string) => void }) {
  const { report, pageById } = useTrace();
  const p = node.kind === "page" ? pageById.get(node.id) : null;
  const dom = node.kind === "external" ? report.sources.find((d) => "x:" + d.domain === node.id) : null;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-all font-mono text-sm">{p ? p.path : node.label}</div>
          {p?.title && <div className="mt-0.5 text-xs text-mute">{p.title}</div>}
        </div>
        <button onClick={onClose} aria-label="Close details" className="font-mono text-mute hover:text-fg">✕</button>
      </div>
      <div className="mt-3">
        <KV k="Type" v={node.kind === "page" ? <><Badge>{KIND_LABEL.page}</Badge> {p?.type}</> : KIND_LABEL[node.kind]} />
        {p && (
          <>
            <KV k="Section" v={report.sections.find((s) => s.id === p.section)?.label ?? "—"} />
            <KV k="Depth" v={p.depth} />
            <KV k="Status" v={p.status ?? "failed"} />
            <KV k="Internal links" v={p.internalLinkCount} />
            <KV k="Outbound links" v={p.externalLinkCount} />
            <KV k="Incoming" v={p.incoming.length} />
            <KV k="Forms" v={p.forms.length} />
            <KV k="Headings" v={p.headings.length} />
            <KV k="Images" v={p.images.length} />
          </>
        )}
        {dom && (
          <>
            <KV k="Category" v={dom.category} />
            <KV k="References" v={dom.refs} />
            <KV k="Pages" v={dom.pageIds.length} />
            <KV k="Link types" v={dom.kinds.join(", ")} />
          </>
        )}
        {node.kind !== "page" && node.sub && <KV k="Detail" v={node.sub} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {p && <Btn variant="primary" onClick={() => openXray(p.id)}>Open X-ray</Btn>}
        <Btn onClick={onFocus}>{focus ? "Unfocus" : "Focus"}</Btn>
        {dom && <Btn onClick={() => goto("sources", "domain:" + dom.domain)}>Sources</Btn>}
      </div>
      {p && (
        <div className="mt-5 space-y-4">
          <RelList title={`← Incoming (${p.incoming.length})`} ids={p.incoming} select={select} />
          <RelList title={`→ Outgoing (${p.outgoing.length})`} ids={p.outgoing} select={select} />
        </div>
      )}
      {dom && (
        <div className="mt-5">
          <Label className="mb-1">Appears on</Label>
          <ul className="space-y-0.5">
            {dom.pageIds.slice(0, 12).map((id) => (
              <li key={id}><button onClick={() => select(id)} className="font-mono text-xs text-mute hover:text-accent">{pageById.get(id)?.path}</button></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RelList({ title, ids, select }: { title: string; ids: string[]; select: (id: string) => void }) {
  const { pageById } = useTrace();
  return (
    <div>
      <Label className="mb-1">{title}</Label>
      {ids.length === 0 ? (
        <div className="text-xs text-dim">None</div>
      ) : (
        <ul className="space-y-0.5">
          {ids.slice(0, 10).map((id) => (
            <li key={id}><button onClick={() => select(id)} className="block max-w-full truncate font-mono text-xs text-mute hover:text-accent">{pageById.get(id)?.path}</button></li>
          ))}
          {ids.length > 10 && <li className="text-[11px] text-dim">+{ids.length - 10} more</li>}
        </ul>
      )}
    </div>
  );
}

function ListView({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const { report, pageById, matches } = useTrace();
  return (
    <div className="h-full overflow-auto p-4 sm:p-6" role="tree" aria-label="Website structure (list view)">
      <p className="mb-4 max-w-2xl text-xs text-mute">Accessible list representation of the map. Sections are inferred from URL paths; each page lists the analyzed pages it links to.</p>
      {report.sections.map((s) => {
        const pages = s.pageIds.map((id) => pageById.get(id)!).filter((p) => p && matches(p)).sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
        if (!pages.length) return null;
        return (
          <div key={s.id} className="mb-6" role="group" aria-label={s.label}>
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: sectionColor(s.label) }} />
              <Label className="text-fg">{s.label}</Label>
              <span className="text-xs text-dim">{pages.length} pages · inferred</span>
            </div>
            <ul className="border-l border-line">
              {pages.map((p) => (
                <li key={p.id} role="treeitem" aria-selected={selected === p.id} style={{ paddingLeft: p.depth * 14 }}>
                  <button onClick={() => onSelect(p.id)} className={cx("flex w-full items-center gap-3 py-1.5 pl-3 text-left hover:bg-panel", selected === p.id && "bg-panel")}>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{p.path}</span>
                    <span className="hidden truncate text-xs text-mute sm:block sm:max-w-[16rem]">{p.title}</span>
                    <Badge>{p.type}</Badge>
                    <span className="w-14 text-right font-mono text-[10px] text-dim">→ {p.outgoing.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
