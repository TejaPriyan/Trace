"use client";
import { useMemo, useState } from "react";
import { FilterBar } from "../FilterBar";
import { StructuralPreview } from "../StructuralPreview";
import { useTrace } from "../TraceContext";
import { Badge, Empty, Label, SectionTitle, cx } from "../ui";
import type { PageReport } from "@/lib/trace/types";

type SortKey = "path" | "title" | "type" | "depth" | "internalLinkCount" | "externalLinkCount" | "status";
type Group = "none" | "type" | "section" | "depth";

export function PagesView() {
  const { report, matches, openXray } = useTrace();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "depth", dir: 1 });
  const [group, setGroup] = useState<Group>("none");
  const [gallery, setGallery] = useState(false);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = report.pages.filter((p) => matches(p) && (!s || p.path.toLowerCase().includes(s) || p.title?.toLowerCase().includes(s) || p.type.toLowerCase().includes(s)));
    const val = (p: PageReport) => (sort.key === "status" ? p.status ?? 0 : (p[sort.key] ?? "") as string | number);
    return list.sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return (c || a.path.localeCompare(b.path)) * sort.dir;
    });
  }, [report, matches, q, sort]);

  const groups = useMemo(() => {
    if (group === "none") return [{ key: "", items: rows }];
    const m = new Map<string, PageReport[]>();
    for (const p of rows) {
      const k = group === "type" ? p.type : group === "depth" ? `Depth ${p.depth}` : report.sections.find((s) => s.id === p.section)?.label ?? "—";
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return [...m.entries()].map(([key, items]) => ({ key, items }));
  }, [rows, group, report.sections]);

  const th = (key: SortKey, label: string, cls = "") => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cx("px-3 py-2 text-left font-normal", cls)}>
      <button onClick={() => setSort({ key, dir: sort.key === key ? (sort.dir === 1 ? -1 : 1) : 1 })} className="font-mono text-[10px] uppercase tracking-[0.16em] text-mute hover:text-accent">
        {label}
        {sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <div className="mx-auto max-w-7xl p-5 sm:p-8">
      <SectionTitle kicker="Page explorer" title={`${rows.length} of ${report.pages.length} pages`} right={<span className="text-xs text-mute">Page types are heuristic (inferred from URL paths and metadata).</span>} />
      <div className="mb-5 flex flex-wrap items-start gap-2">
        <label className="sr-only" htmlFor="pq">Search pages</label>
        <input id="pq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search path, title, type…" className="w-60 border border-line bg-panel px-3 py-2 font-mono text-xs outline-none placeholder:text-dim focus:border-accent" />
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-mute">
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value as Group)} className="border border-line bg-panel px-2 py-2 text-fg">
            <option value="none">None</option>
            <option value="type">Type</option>
            <option value="section">Section</option>
            <option value="depth">Depth</option>
          </select>
        </label>
        <FilterBar />
        <div className="ml-auto flex" role="group" aria-label="View mode">
          {[
            ["Table", false],
            ["Gallery", true],
          ].map(([l, v]) => (
            <button key={l as string} onClick={() => setGallery(v as boolean)} aria-pressed={gallery === v} className={cx("-ml-px border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-wider first:ml-0", gallery === v ? "z-10 border-accent bg-accent/10 text-accent" : "text-mute hover:text-fg")}>
              {l as string}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty title="No pages" text="No pages match your search and filters." />
      ) : gallery ? (
        <div className="space-y-8">
          {groups.map((g) => (
            <div key={g.key}>
              {g.key && <Label className="mb-3 text-fg">{g.key} · {g.items.length}</Label>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.items.map((p) => (
                  <button key={p.id} onClick={() => openXray(p.id)} className="group border border-line bg-panel text-left transition hover:border-accent">
                    <div className="p-2">
                      <StructuralPreview page={p} compact />
                    </div>
                    <div className="border-t border-line p-3">
                      <div className="truncate text-sm font-medium group-hover:text-accent">{p.title ?? "Untitled"}</div>
                      <div className="truncate font-mono text-xs text-mute">{p.path}</div>
                      <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-dim">
                        {p.type} · Depth {p.depth}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-dim">Previews are structural wireframes generated from extracted page structure — screenshots are not captured.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-line">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Analyzed pages</caption>
            <thead className="border-b border-line bg-panel">
              <tr>
                {th("path", "Page")}
                {th("title", "Title")}
                {th("type", "Type")}
                {th("depth", "Depth")}
                {th("internalLinkCount", "Int. links")}
                {th("externalLinkCount", "Ext. links")}
                {th("status", "Status")}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.key} className="divide-y divide-line">
                {g.key && (
                  <tr className="bg-panel2">
                    <td colSpan={7} className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-fg">{g.key} · {g.items.length}</td>
                  </tr>
                )}
                {g.items.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-panel" onClick={() => openXray(p.id)}>
                    <td className="max-w-[16rem] truncate px-3 py-2 font-mono text-xs">
                      <button onClick={(e) => { e.stopPropagation(); openXray(p.id); }} className="max-w-full truncate text-left hover:text-accent">{p.path}</button>
                    </td>
                    <td className="max-w-[18rem] truncate px-3 py-2 text-mute">{p.title ?? <span className="text-dim">—</span>}</td>
                    <td className="px-3 py-2"><Badge>{p.type}</Badge></td>
                    <td className="px-3 py-2 font-mono text-xs">{p.depth}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.internalLinkCount}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.externalLinkCount}</td>
                    <td className={cx("px-3 py-2 font-mono text-xs", p.broken && "text-bad")}>{p.status ?? "fail"}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
