"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrace } from "../TraceContext";
import { ConfBadge, Empty, Label, SectionTitle, cx } from "../ui";
import { TECH_CATEGORIES, type TechCategory } from "@/lib/trace/types";

export function TechnologyView() {
  const { report, focusKey, pageById, openXray } = useTrace();
  const [cat, setCat] = useState<TechCategory | null>(null);
  const cats = useMemo(() => TECH_CATEGORIES.filter((c) => report.technologies.some((t) => t.category === c)), [report]);
  const focusRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusKey]);
  const resources = useMemo(() => {
    const m = new Map<string, { url: string; kind: string; pages: Set<string> }>();
    for (const r of report.resources) {
      const k = r.kind + r.url;
      const e = m.get(k) ?? { url: r.url, kind: r.kind, pages: new Set<string>() };
      e.pages.add(r.pageId);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.pages.size - a.pages.size);
  }, [report]);
  const shown = report.technologies.filter((t) => !cat || t.category === cat);
  return (
    <div className="mx-auto max-w-6xl space-y-12 p-5 sm:p-8">
      <section>
        <SectionTitle kicker="Technology" title={`${report.technologies.length} technology signals`} right={<span className="max-w-sm text-right text-xs text-mute">Only observable signals — markup, resource URLs and response headers. Confidence reflects how specific the evidence is.</span>} />
        {report.technologies.length === 0 ? (
          <Empty title="Not detected" text="No known technology signatures were observed in the analyzed pages." />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              <button onClick={() => setCat(null)} aria-pressed={!cat} className={cx("border px-2 py-1 font-mono text-[10px] uppercase tracking-wider", !cat ? "border-accent text-accent" : "border-line text-mute")}>All</button>
              {cats.map((c) => (
                <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={cx("border px-2 py-1 font-mono text-[10px] uppercase tracking-wider", cat === c ? "border-accent text-accent" : "border-line text-mute hover:text-fg")}>
                  {c} · {report.technologies.filter((t) => t.category === c).length}
                </button>
              ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {shown.map((t) => {
                const focused = focusKey === "tech:" + t.name;
                return (
                  <article key={t.name} ref={focused ? focusRef : undefined} className={cx("border bg-panel p-4", focused ? "border-accent" : "border-line")}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Label>{t.category}</Label>
                        <h3 className="mt-0.5 text-lg font-semibold uppercase tracking-tight">{t.name}</h3>
                      </div>
                      <ConfBadge c={t.confidence} />
                    </div>
                    <dl className="mt-3 space-y-2.5 text-xs">
                      {t.signals.slice(0, 3).map((s, i) => (
                        <div key={i}>
                          <dt className="font-mono text-[10px] uppercase tracking-wider text-mute">Signal</dt>
                          <dd className="text-fg">{s.signal}</dd>
                          <dt className="mt-1 font-mono text-[10px] uppercase tracking-wider text-mute">Evidence</dt>
                          <dd className="break-all font-mono text-[11px] text-mute">{s.evidence}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-2">
                      <span className="mr-1 font-mono text-[10px] uppercase tracking-wider text-dim">Seen on {t.pageIds.length} page{t.pageIds.length === 1 ? "" : "s"}</span>
                      {t.pageIds.slice(0, 3).map((id) => (
                        <button key={id} onClick={() => openXray(id)} className="font-mono text-[11px] text-mute underline decoration-line hover:text-accent">
                          {pageById.get(id)?.path}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section>
        <SectionTitle kicker="Resources" title="Detectable APIs & resources" />
        {resources.length === 0 ? (
          <Empty text="No API, feed or manifest references were detected." />
        ) : (
          <ul className="divide-y divide-line border border-line">
            {resources.map((r) => (
              <li key={r.kind + r.url} className={cx("flex items-center gap-3 px-3 py-2", focusKey === "res:" + r.url && "bg-panel2")}>
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-wider text-accent">{r.kind}</span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{r.url}</span>
                <span className="font-mono text-[11px] text-dim">{r.pages.size} page{r.pages.size === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-dim">Only public path references are listed (query strings are removed). TRACE does not probe or call these endpoints.</p>
      </section>
    </div>
  );
}
