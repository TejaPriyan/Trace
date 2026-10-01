"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { GraphEdge, GraphNode, PageReport } from "@/lib/trace/types";
import { computeLayout, radiusOf, type LayoutKind, type Pos } from "@/lib/trace/layout";
import { sectionColor } from "./ui";

export type MapColorMode = "section" | "status" | "depth";
export type MapSizeMode = "default" | "links" | "words";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  layout: LayoutKind;
  parentOf: Map<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  matches: Set<string> | null;
  assemble: boolean;
  resetSignal: number;
  fitSignal: number;
  centerOn: { id: string; n: number } | null;
  svgRef: RefObject<SVGSVGElement | null>;
  colorMode?: MapColorMode;
  sizeMode?: MapSizeMode;
  pageById?: Map<string, PageReport>;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function GraphCanvas({
  nodes,
  edges,
  layout,
  parentOf,
  selectedId,
  onSelect,
  matches,
  assemble,
  resetSignal,
  fitSignal,
  centerOn,
  svgRef,
  colorMode = "section",
  sizeMode = "default",
  pageById,
}: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [overrides, setOverrides] = useState<Record<string, Pos>>({});
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ kind: "pan" | "node"; id?: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const key = useMemo(() => nodes.map((n) => n.id).join("|") + "#" + layout, [nodes, layout]);
  const base = useMemo(() => computeLayout(nodes, edges, layout, parentOf), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const pos = useCallback((id: string): Pos => overrides[id] ?? base.get(id) ?? { x: 0, y: 0 }, [overrides, base]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const getNodeRadius = useCallback(
    (n: GraphNode) => {
      const p = n.kind === "page" && pageById ? pageById.get(n.id) : null;
      if (sizeMode === "links" && p) {
        return clamp(7 + Math.min(22, p.incoming.length * 2.2), 6, 26);
      }
      if (sizeMode === "words" && p) {
        return clamp(7 + Math.min(22, Math.sqrt(p.wordCount / 4)), 6, 26);
      }
      return radiusOf(n);
    },
    [sizeMode, pageById],
  );

  const getNodeColor = useCallback(
    (n: GraphNode) => {
      if (n.kind !== "page") return "var(--mute)";
      const p = pageById ? pageById.get(n.id) : null;
      if (colorMode === "status") {
        const st = p?.status;
        if (st === null || (st && st >= 400)) return "var(--bad)";
        if (st && st >= 300) return "var(--warn)";
        return "var(--ok)";
      }
      if (colorMode === "depth") {
        const d = n.depth ?? p?.depth ?? 0;
        if (d === 0) return "var(--accent)";
        if (d === 1) return "#38bdf8";
        if (d === 2) return "#818cf8";
        return "#c084fc";
      }
      return sectionColor(n.section ?? "");
    },
    [colorMode, pageById],
  );

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 }));
    ro.observe(el);
    setSize({ w: el.clientWidth || 800, h: el.clientHeight || 600 });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(
    (ids?: string[]) => {
      const list = (ids ? nodes.filter((n) => ids.includes(n.id)) : nodes).map((n) => pos(n.id));
      if (!list.length) return;
      const minX = Math.min(...list.map((p) => p.x));
      const maxX = Math.max(...list.map((p) => p.x));
      const minY = Math.min(...list.map((p) => p.y));
      const maxY = Math.max(...list.map((p) => p.y));
      const bw = maxX - minX + 140;
      const bh = maxY - minY + 140;
      const k = clamp(Math.min(size.w / bw, size.h / bh), 0.08, 1.5);
      setView({ k, x: size.w / 2 - ((minX + maxX) / 2) * k, y: size.h / 2 - ((minY + maxY) / 2) * k });
    },
    [nodes, pos, size.w, size.h],
  );

  // refit on layout / node-set / reset / explicit fit request
  useEffect(() => {
    fit();
  }, [base, resetSignal, fitSignal, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setOverrides({});
  }, [resetSignal, layout]);

  useEffect(() => {
    if (!centerOn) return;
    const p = pos(centerOn.id);
    setView((v) => ({ ...v, x: size.w / 2 - p.x * 1.1, y: size.h / 2 - p.y * 1.1, k: 1.1 }));
  }, [centerOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // wheel zoom (non-passive)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = clamp(v.k * Math.exp(-e.deltaY * 0.0016), 0.05, 4);
        return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const zoomBy = (f: number) =>
    setView((v) => {
      const k = clamp(v.k * f, 0.05, 4);
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { k, x: cx - (cx - v.x) * (k / v.k), y: cy - (cy - v.y) * (k / v.k) };
    });

  // related sets for highlighting
  const rel = useMemo(() => {
    if (!selectedId) return null;
    const outs = new Set<string>();
    const ins = new Set<string>();
    for (const e of edges) {
      if (e.source === selectedId) outs.add(e.target);
      if (e.target === selectedId) ins.add(e.source);
    }
    const parent = parentOf.get(selectedId);
    const children = new Set<string>();
    for (const [c, p] of parentOf) if (p === selectedId) children.add(c);
    return { outs, ins, parent, children };
  }, [selectedId, edges, parentOf]);

  const active = useMemo(() => {
    if (rel && selectedId) {
      const s = new Set<string>([selectedId, ...rel.outs, ...rel.ins, ...rel.children]);
      if (rel.parent) s.add(rel.parent);
      return s;
    }
    return matches;
  }, [rel, selectedId, matches]);

  const onBgDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
  };
  const onNodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = pos(id);
    drag.current = { kind: "node", id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    if (d.kind === "pan") setView((v) => ({ ...v, x: d.ox + dx, y: d.oy + dy }));
    else if (d.id) setOverrides((o) => ({ ...o, [d.id!]: { x: d.ox + dx / viewRef.current.k, y: d.oy + dy / viewRef.current.k } }));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (d.kind === "node" && d.id) onSelect(d.id === selectedId ? d.id : d.id);
    else onSelect(null);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step = 50;
    if (e.key === "ArrowLeft") setView((v) => ({ ...v, x: v.x + step }));
    else if (e.key === "ArrowRight") setView((v) => ({ ...v, x: v.x - step }));
    else if (e.key === "ArrowUp") setView((v) => ({ ...v, y: v.y + step }));
    else if (e.key === "ArrowDown") setView((v) => ({ ...v, y: v.y - step }));
    else if (e.key === "+" || e.key === "=") zoomBy(1.2);
    else if (e.key === "-") zoomBy(1 / 1.2);
    else if (e.key === "0") fit();
    else if (e.key === "Escape") onSelect(null);
    else return;
    e.preventDefault();
  };

  // stagger labels vertically within a row to reduce overlap in the hierarchy layout
  const labelRow = useMemo(() => {
    const m = new Map<string, number>();
    if (layout !== "hierarchy") return m;
    const rows = new Map<number, { id: string; x: number }[]>();
    for (const n of nodes) {
      const p = pos(n.id);
      const k = Math.round(p.y / 10);
      (rows.get(k) ?? rows.set(k, []).get(k)!).push({ id: n.id, x: p.x });
    }
    for (const list of rows.values()) list.sort((a, b) => a.x - b.x).forEach((it, i) => m.set(it.id, i % 3));
    return m;
  }, [nodes, pos, layout]);

  const showAllLabels = nodes.length <= 45 || view.k >= 0.85;
  const fs = clamp(11 / view.k, 7, 26);

  return (
    <div ref={wrap} className="map-grid relative h-full w-full touch-none select-none overflow-hidden" tabIndex={0} onKeyDown={onKey} role="application" aria-label="Website map. Use arrow keys to pan, plus and minus to zoom, zero to fit. A list view alternative is available.">
      <svg ref={svgRef} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} className="block cursor-grab active:cursor-grabbing" onPointerDown={onBgDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arr-out" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
          </marker>
          <marker id="arr-in" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--warm)" />
          </marker>
        </defs>
        <rect x={0} y={0} width={size.w} height={size.h} fill="transparent" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g>
            {edges.map((e) => {
              const a = pos(e.source);
              const b = pos(e.target);
              const sn = byId.get(e.source);
              const tn = byId.get(e.target);
              if (!sn || !tn) return null;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const len = Math.hypot(dx, dy) || 1;
              const ra = getNodeRadius(sn) + 1;
              const rb = getNodeRadius(tn) + 3;
              const x1 = a.x + (dx / len) * ra;
              const y1 = a.y + (dy / len) * ra;
              const x2 = b.x - (dx / len) * rb;
              const y2 = b.y - (dy / len) * rb;
              const isOut = selectedId === e.source;
              const isIn = selectedId === e.target;
              const tree = parentOf.get(e.target) === e.source;
              let stroke = "var(--mute)";
              let op = tree ? 0.55 : e.kind === "link" ? 0.28 : e.kind === "nav" ? 0.14 : 0.14;
              let w = tree ? 1.4 : 1;
              if (selectedId) {
                if (isOut) {
                  stroke = "var(--accent)";
                  op = 0.95;
                  w = 1.8;
                } else if (isIn) {
                  stroke = "var(--warm)";
                  op = 0.95;
                  w = 1.8;
                } else op = 0.04;
              } else if (matches) op = 0.05;
              return (
                <line
                  key={e.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={stroke}
                  strokeOpacity={op}
                  strokeWidth={w / Math.max(0.6, Math.min(view.k, 1.4))}
                  strokeDasharray={e.kind === "external" || e.kind === "asset" || e.kind === "resource" ? "3 4" : undefined}
                  markerEnd={isOut ? "url(#arr-out)" : isIn ? "url(#arr-in)" : undefined}
                  className={assemble ? "edge-assemble" : undefined}
                  style={assemble ? { animationDelay: `${700 + Math.min(1200, nodes.length * 18)}ms` } : undefined}
                />
              );
            })}
          </g>
          <g>
            {nodes.map((n, i) => {
              const p = pos(n.id);
              const r = getNodeRadius(n);
              const isSel = n.id === selectedId;
              const isActive = !active || active.has(n.id);
              const isMatch = !!matches && matches.has(n.id);
              const showLabel = showAllLabels || isSel || hover === n.id || isMatch || (!!active && active.has(n.id)) || (n.kind === "page" && (n.depth ?? 9) === 0);
              const color = getNodeColor(n);
              const broken = n.category === "broken";
              return (
                <g key={n.id} transform={`translate(${p.x} ${p.y})`} opacity={isActive ? 1 : 0.13} style={{ transition: "opacity .18s" }}>
                  <g
                    className={assemble ? "node-assemble" : undefined}
                    style={assemble ? { animationDelay: `${Math.min(1500, i * 28)}ms` } : undefined}
                    onPointerDown={(e) => onNodeDown(e, n.id)}
                    onPointerEnter={() => setHover(n.id)}
                    onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                    onFocus={() => setHover(n.id)}
                    onBlur={() => setHover(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        onSelect(n.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`${n.kind} ${n.label}${n.sub ? ", " + n.sub : ""}`}
                    aria-pressed={isSel}
                    cursor="pointer"
                  >
                    <title>{n.kind === "page" ? `${n.label}${n.sub ? " — " + n.sub : ""}` : `${n.kind}: ${n.label}`}</title>
                    {isSel && <circle r={r + 7} fill="none" stroke="var(--accent)" strokeWidth={1.5 / Math.min(1.2, view.k)} />}
                    {isMatch && !isSel && <circle r={r + 5} fill="none" stroke="var(--warm)" strokeWidth={1.5 / Math.min(1.2, view.k)} />}
                    {n.kind === "page" && <circle r={r} fill={color} fillOpacity={0.88} stroke={broken ? "var(--bad)" : "var(--bg)"} strokeWidth={broken ? 2.5 : 1.5} strokeDasharray={broken ? "3 2" : undefined} />}
                    {n.kind === "page" && n.depth === 0 && <circle r={r + 3} fill="none" stroke="var(--fg)" strokeWidth={1} />}
                    {n.kind === "external" && <rect x={-r} y={-r} width={r * 2} height={r * 2} transform="rotate(45)" fill="var(--panel)" stroke="var(--fg)" strokeOpacity={0.6} strokeWidth={1.4} />}
                    {n.kind === "asset" && <rect x={-r + 1} y={-r + 1} width={(r - 1) * 2} height={(r - 1) * 2} fill="var(--panel)" stroke="var(--dim)" strokeWidth={1.4} />}
                    {n.kind === "form" && <polygon points={`0,${-r - 1} ${r + 1},${r} ${-r - 1},${r}`} fill="var(--panel)" stroke="var(--warm)" strokeWidth={1.6} />}
                    {n.kind === "resource" && <circle r={r - 1} fill="var(--panel)" stroke="var(--accent)" strokeWidth={1.4} strokeDasharray="2 2" />}
                    {showLabel && (
                      <text y={r + fs + 2 + (labelRow.get(n.id) ?? 0) * fs * 1.15} textAnchor="middle" fontSize={fs} fill="var(--fg)" style={{ paintOrder: "stroke", stroke: "var(--bg)", strokeWidth: 3.5 / view.k, fontFamily: "var(--font-mono)" }}>
                        {n.label}
                      </text>
                    )}
                  </g>
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      <div className="absolute bottom-3 left-3 flex flex-col border border-line bg-panel/90 backdrop-blur no-print" role="group" aria-label="Zoom controls">
        {[
          ["+", "Zoom in", () => zoomBy(1.25)],
          ["−", "Zoom out", () => zoomBy(1 / 1.25)],
          ["⤢", "Fit to view", () => fit()],
        ].map(([l, t, f]) => (
          <button key={t as string} aria-label={t as string} title={t as string} onClick={f as () => void} className="h-8 w-8 font-mono text-sm text-mute hover:text-accent">
            {l as string}
          </button>
        ))}
      </div>
    </div>
  );
}
