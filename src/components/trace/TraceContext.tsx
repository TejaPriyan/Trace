"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PageReport, PageType, TechCategory, TraceReport } from "@/lib/trace/types";

export type ViewKey = "overview" | "map" | "pages" | "journeys" | "content" | "technology" | "signals" | "sources" | "findings" | "report";
export const VIEWS: { key: ViewKey; label: string; code: string }[] = [
  { key: "overview", label: "Overview", code: "OV" },
  { key: "map", label: "Map", code: "MP" },
  { key: "pages", label: "Pages", code: "PG" },
  { key: "journeys", label: "Journeys", code: "JR" },
  { key: "content", label: "Content", code: "CT" },
  { key: "technology", label: "Technology", code: "TC" },
  { key: "signals", label: "Signals", code: "SG" },
  { key: "sources", label: "Sources", code: "SR" },
  { key: "findings", label: "Findings", code: "FD" },
  { key: "report", label: "Report", code: "RP" },
];

export interface Filters {
  types: PageType[];
  depths: ("0" | "1" | "2" | "3+")[];
  linkTypes: ("internal" | "external")[];
  techCats: TechCategory[];
}
export const EMPTY_FILTERS: Filters = { types: [], depths: [], linkTypes: [], techCats: [] };
export const filtersActive = (f: Filters) => f.types.length + f.depths.length + f.linkTypes.length + f.techCats.length > 0;

interface Ctx {
  report: TraceReport;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  pageById: Map<string, PageReport>;
  xrayId: string | null;
  openXray: (id: string | null) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  matches: (p: PageReport) => boolean;
  focusKey: string | null;
  goto: (v: ViewKey, focusKey?: string | null) => void;
  selectedNode: string | null;
  setSelectedNode: (id: string | null) => void;
}

const C = createContext<Ctx | null>(null);
export function useTrace() {
  const c = useContext(C);
  if (!c) throw new Error("useTrace outside provider");
  return c;
}

export function TraceProvider({ report, children }: { report: TraceReport; children: ReactNode }) {
  const [view, setViewState] = useState<ViewKey>("overview");
  const [xrayId, setXray] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const pageById = useMemo(() => new Map(report.pages.map((p) => [p.id, p])), [report]);
  const techCat = useMemo(() => new Map(report.technologies.map((t) => [t.name, t.category])), [report]);

  useEffect(() => {
    const h = window.location.hash.replace("#", "") as ViewKey;
    if (VIEWS.some((v) => v.key === h)) setViewState(h);
    const onHash = () => {
      const x = window.location.hash.replace("#", "") as ViewKey;
      if (VIEWS.some((v) => v.key === x)) setViewState(x);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setView = useCallback((v: ViewKey) => {
    setViewState(v);
    history.replaceState(null, "", `#${v}`);
  }, []);
  const goto = useCallback(
    (v: ViewKey, fk?: string | null) => {
      setFocusKey(fk ?? null);
      setView(v);
    },
    [setView],
  );

  const matches = useCallback(
    (p: PageReport) => {
      if (filters.types.length && !filters.types.includes(p.type)) return false;
      if (filters.depths.length) {
        const d = p.depth >= 3 ? "3+" : (String(p.depth) as "0" | "1" | "2");
        if (!filters.depths.includes(d)) return false;
      }
      if (filters.techCats.length && !p.techNames.some((n) => filters.techCats.includes(techCat.get(n) as TechCategory))) return false;
      return true;
    },
    [filters, techCat],
  );

  const value: Ctx = { report, view, setView, pageById, xrayId, openXray: setXray, filters, setFilters, matches, focusKey, goto, selectedNode, setSelectedNode };
  return <C.Provider value={value}>{children}</C.Provider>;
}
