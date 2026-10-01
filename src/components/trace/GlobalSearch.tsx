"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrace } from "./TraceContext";
import { Label } from "./ui";

interface Hit {
  group: string;
  label: string;
  sub?: string;
  run: () => void;
}

export function GlobalSearch() {
  const { report, openXray, goto } = useTrace();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/input|textarea|select/i.test(t.tagName)) {
        e.preventDefault();
        ref.current?.focus();
      }
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.blur();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: Hit[] = [];
    const cap = <T,>(arr: T[]) => arr.slice(0, 5);
    cap(report.pages.filter((p) => p.path.toLowerCase().includes(s) || p.title?.toLowerCase().includes(s))).forEach((p) => out.push({ group: "Pages", label: p.path, sub: p.title ?? p.type, run: () => openXray(p.id) }));
    cap(report.sources.filter((d) => d.domain.includes(s) || d.category.toLowerCase().includes(s))).forEach((d) => out.push({ group: "Domains", label: d.domain, sub: `${d.category} · ${d.pageIds.length} pages`, run: () => goto("sources", "domain:" + d.domain) }));
    cap(report.technologies.filter((t) => t.name.toLowerCase().includes(s) || t.category.toLowerCase().includes(s))).forEach((t) => out.push({ group: "Technologies", label: t.name, sub: `${t.category} · ${t.confidence}`, run: () => goto("technology", "tech:" + t.name) }));
    cap(report.claims.filter((c) => c.text.toLowerCase().includes(s))).forEach((c) => out.push({ group: "Claims", label: c.text.slice(0, 90), sub: report.pages.find((p) => p.id === c.pageId)?.path, run: () => goto("sources", "claim:" + c.id) }));
    cap(report.resources.filter((r) => r.url.toLowerCase().includes(s))).forEach((r) => out.push({ group: "Resources", label: r.url.replace(/^https?:\/\//, ""), sub: r.kind, run: () => goto("technology", "res:" + r.url) }));
    cap(report.findings.filter((f) => f.title.toLowerCase().includes(s) || f.explanation.toLowerCase().includes(s))).forEach((f) => out.push({ group: "Findings", label: f.title, sub: f.category, run: () => goto("findings", f.id) }));
    return out;
  }, [q, report, openXray, goto]);

  const groups = [...new Set(hits.map((h) => h.group))];
  return (
    <div ref={box} className="relative">
      <label htmlFor="gsearch" className="sr-only">
        Search this trace
      </label>
      <input
        id="gsearch"
        ref={ref}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search /"
        autoComplete="off"
        className="w-28 border border-line bg-panel px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-dim focus:border-accent sm:w-52"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 z-50 mt-1 max-h-[70vh] w-[min(92vw,26rem)] overflow-auto border border-line bg-panel shadow-2xl" role="listbox" aria-label="Search results">
          {hits.length === 0 && <div className="p-4 text-sm text-mute">Nothing found for “{q}”.</div>}
          {groups.map((g) => (
            <div key={g} className="border-b border-line last:border-0">
              <Label className="px-3 pb-1 pt-3">{g}</Label>
              {hits
                .filter((h) => h.group === g)
                .map((h, i) => (
                  <button
                    key={i}
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      h.run();
                      setOpen(false);
                      setQ("");
                    }}
                    className="block w-full px-3 py-1.5 text-left hover:bg-panel2"
                  >
                    <div className="truncate font-mono text-xs">{h.label}</div>
                    {h.sub && <div className="truncate text-[11px] text-mute">{h.sub}</div>}
                  </button>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
