"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTrace } from "../TraceContext";
import { Badge, Empty, Label, SectionTitle, cx } from "../ui";
import type { DomainCategory } from "@/lib/trace/types";

export function SourcesView() {
  const { report, focusKey } = useTrace();
  const [tab, setTab] = useState<"domains" | "claims">(focusKey?.startsWith("claim:") ? "claims" : "domains");
  useEffect(() => {
    if (focusKey?.startsWith("claim:")) setTab("claims");
    else if (focusKey?.startsWith("domain:")) setTab("domains");
  }, [focusKey]);
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <SectionTitle kicker="Sources" title="Where information comes from" />
      <div className="mb-6 flex gap-1" role="tablist">
        {(["domains", "claims"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em]", tab === k ? "border-accent bg-accent/10 text-accent" : "border-line text-mute hover:text-fg")}>
            {k === "domains" ? `Source graph · ${report.sources.length}` : `Claims & evidence · ${report.claims.length}`}
          </button>
        ))}
      </div>
      {tab === "domains" ? <Domains /> : <Claims />}
    </div>
  );
}

function Domains() {
  const { report, pageById, openXray, focusKey } = useTrace();
  const [cat, setCat] = useState<DomainCategory | null>(null);
  const [sel, setSel] = useState<string | null>(focusKey?.startsWith("domain:") ? focusKey.slice(7) : null);
  useEffect(() => {
    if (focusKey?.startsWith("domain:")) setSel(focusKey.slice(7));
  }, [focusKey]);
  const cats = useMemo(() => [...new Set(report.sources.map((d) => d.category))], [report]);
  const list = report.sources.filter((d) => !cat || d.category === cat);
  const cur = report.sources.find((d) => d.domain === sel);
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sel && window.innerWidth < 1024) detail.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [sel]);
  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="border border-line bg-panel p-4">
          <Label>Internal sources</Label>
          <div className="mt-1 font-mono text-sm">{report.hostname}</div>
          <div className="mt-1 text-xs text-mute">{report.pages.length} analyzed pages are the internal sources of this report.</div>
          <Label className="mt-5">External sources</Label>
          {report.sources.length === 0 ? (
            <div className="mt-1 text-xs text-mute">No external domains were referenced.</div>
          ) : (
            <ul className="mt-2 font-mono text-xs" aria-label="Source tree">
              <li className="text-fg">{report.hostname}</li>
              {report.sources.slice(0, 10).map((d, i, a) => (
                <li key={d.domain}>
                  <button onClick={() => setSel(d.domain)} className="py-0.5 text-left text-mute hover:text-accent">
                    <span className="text-dim">{i === a.length - 1 && report.sources.length <= 10 ? " └── " : " ├── "}</span>
                    {d.domain}
                  </button>
                </li>
              ))}
              {report.sources.length > 10 && <li className="text-dim"> └── +{report.sources.length - 10} more</li>}
            </ul>
          )}
        </div>
        <div ref={detail} className="border border-line p-4">
          {cur ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Label>External domain</Label>
                  <div className="break-all font-mono text-lg">{cur.domain}</div>
                </div>
                <Badge tone="accent">{cur.category}</Badge>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-px bg-line">
                {[["References", cur.refs], ["Pages", cur.pageIds.length], ["Link types", cur.kinds.length]].map(([l, v]) => (
                  <div key={l as string} className="bg-bg p-2.5"><Label>{l}</Label><div className="font-mono text-lg">{v}</div></div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">{cur.kinds.map((k) => <Badge key={k}>{k}</Badge>)}{cur.subdomain && <Badge tone="warn">subdomain of site</Badge>}</div>
              <Label className="mb-1 mt-4">Appears on</Label>
              <ul className="space-y-0.5">
                {cur.pageIds.slice(0, 12).map((id) => (
                  <li key={id}><button onClick={() => openXray(id)} className="font-mono text-xs text-mute hover:text-accent">{pageById.get(id)?.path}</button></li>
                ))}
                {cur.pageIds.length > 12 && <li className="text-[11px] text-dim">+{cur.pageIds.length - 12} more</li>}
              </ul>
              <Label className="mb-1 mt-4">Sample URLs</Label>
              <ul className="space-y-0.5 font-mono text-[11px] text-dim">{cur.samples.slice(0, 4).map((s) => <li key={s} className="break-all">{s}</li>)}</ul>
            </div>
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center text-sm text-mute">Select a domain to see where it appears.</div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          <button onClick={() => setCat(null)} aria-pressed={!cat} className={cx("border px-2 py-1 font-mono text-[10px] uppercase tracking-wider", !cat ? "border-accent text-accent" : "border-line text-mute")}>All</button>
          {cats.map((c) => (
            <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c} className={cx("border px-2 py-1 font-mono text-[10px] uppercase tracking-wider", cat === c ? "border-accent text-accent" : "border-line text-mute hover:text-fg")}>
              {c} · {report.sources.filter((d) => d.category === c).length}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <Empty text="No external domains to show." />
        ) : (
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">External domains</caption>
              <thead className="border-b border-line bg-panel text-left font-mono text-[10px] uppercase tracking-[0.16em] text-mute">
                <tr><th className="px-3 py-2 font-normal">Domain</th><th className="px-3 py-2 font-normal">Category</th><th className="px-3 py-2 font-normal">Refs</th><th className="px-3 py-2 font-normal">Pages</th><th className="px-3 py-2 font-normal">Link types</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((d) => (
                  <tr key={d.domain} className={cx("cursor-pointer hover:bg-panel", sel === d.domain && "bg-panel")} onClick={() => setSel(d.domain)}>
                    <td className="px-3 py-2 font-mono text-xs"><button onClick={() => setSel(d.domain)} className="hover:text-accent">{d.domain}</button></td>
                    <td className="px-3 py-2 text-xs text-mute">{d.category}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.refs}</td>
                    <td className="px-3 py-2 font-mono text-xs">{d.pageIds.length}</td>
                    <td className="px-3 py-2 text-xs text-mute">{d.kinds.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[11px] text-dim">Categories are inferred from known domain patterns; “Unknown” means no pattern matched.</p>
      </div>
    </div>
  );
}

function Claims() {
  const { report, pageById, openXray, focusKey } = useTrace();
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusKey]);
  if (report.claims.length === 0) return <Empty title="No claims detected" text="No statements matching claim patterns were found in the server-delivered page text." />;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-mute">Statements the site makes about itself, extracted from public page text. Supporting pages are those whose text shares the claim&apos;s key terms — TRACE does not fabricate evidence and does not judge whether a claim is true.</p>
      {report.claims.map((c) => {
        const page = pageById.get(c.pageId);
        const focused = focusKey === "claim:" + c.id;
        return (
          <article key={c.id} ref={focused ? ref : undefined} className={cx("border bg-panel p-5", focused ? "border-accent" : "border-line")}>
            <Label>Claim</Label>
            <blockquote className="mt-1 text-lg leading-snug tracking-tight">“{c.text}”</blockquote>
            <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-2">
              <div>
                <dt><Label>Found on</Label></dt>
                <dd className="mt-1"><button onClick={() => openXray(c.pageId)} className="font-mono hover:text-accent">{page?.path}</button></dd>
              </div>
              <div>
                <dt><Label>Evidence</Label></dt>
                <dd className="mt-1 text-mute">{c.evidence}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt><Label>Context</Label></dt>
                <dd className="mt-1 text-mute">{c.context}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt><Label>Related pages</Label></dt>
                <dd className="mt-1">
                  {c.related.length === 0 && !c.cite ? (
                    <span className="text-mute">No supporting source detected within the crawled site.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {c.related.map((id) => (
                        <button key={id} onClick={() => openXray(id)} className="font-mono text-mute underline decoration-line hover:text-accent">{pageById.get(id)?.path}</button>
                      ))}
                      {c.cite && <Badge tone="accent">cites {c.cite}</Badge>}
                    </div>
                  )}
                </dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
