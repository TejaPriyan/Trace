"use client";
import { useMemo, useState } from "react";
import { EMPTY_FILTERS, filtersActive, useTrace, type Filters } from "./TraceContext";
import { Label, cx } from "./ui";
import { TECH_CATEGORIES } from "@/lib/trace/types";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cx("border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition", on ? "border-accent bg-accent/10 text-accent" : "border-line text-mute hover:text-fg")}>
      {children}
    </button>
  );
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function FilterBar({ showLinkTypes = false }: { showLinkTypes?: boolean }) {
  const { report, filters, setFilters } = useTrace();
  const [open, setOpen] = useState(false);
  const types = useMemo(() => [...new Set(report.pages.map((p) => p.type))], [report]);
  const cats = useMemo(() => TECH_CATEGORIES.filter((c) => report.technologies.some((t) => t.category === c)), [report]);
  const set = (p: Partial<Filters>) => setFilters({ ...filters, ...p });
  const n = filters.types.length + filters.depths.length + filters.linkTypes.length + filters.techCats.length;
  return (
    <div>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className={cx("border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]", n ? "border-accent text-accent" : "border-line text-mute hover:text-fg")}>
        Filters{n ? ` · ${n}` : ""}
      </button>
      {open && (
        <div className="mt-2 grid gap-3 border border-line bg-panel p-3 sm:grid-cols-2" role="group" aria-label="Filters">
          <div>
            <Label className="mb-1.5">Page type</Label>
            <div className="flex flex-wrap gap-1">
              {types.map((t) => (
                <Chip key={t} on={filters.types.includes(t)} onClick={() => set({ types: toggle(filters.types, t) })}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1.5">Depth</Label>
            <div className="flex flex-wrap gap-1">
              {(["0", "1", "2", "3+"] as const).map((d) => (
                <Chip key={d} on={filters.depths.includes(d)} onClick={() => set({ depths: toggle(filters.depths, d) })}>
                  {d}
                </Chip>
              ))}
            </div>
          </div>
          {showLinkTypes && (
            <div>
              <Label className="mb-1.5">Link type</Label>
              <div className="flex flex-wrap gap-1">
                {(["internal", "external"] as const).map((d) => (
                  <Chip key={d} on={filters.linkTypes.includes(d)} onClick={() => set({ linkTypes: toggle(filters.linkTypes, d) })}>
                    {d}
                  </Chip>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label className="mb-1.5">Technology (pages using)</Label>
            <div className="flex flex-wrap gap-1">
              {cats.length === 0 && <span className="text-xs text-dim">Not detected</span>}
              {cats.map((c) => (
                <Chip key={c} on={filters.techCats.includes(c)} onClick={() => set({ techCats: toggle(filters.techCats, c) })}>
                  {c}
                </Chip>
              ))}
            </div>
          </div>
          {filtersActive(filters) && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="justify-self-start font-mono text-[10px] uppercase tracking-wider text-mute underline hover:text-accent">
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
