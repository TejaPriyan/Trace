"use client";
import { useState } from "react";
import { useTrace } from "../TraceContext";
import { Btn, Label, SectionTitle, fmtDate } from "../ui";
import type { Check } from "@/lib/trace/types";

const EXPORT_BASE = (id: string) => `/api/trace/${id}/export`;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-break border-t border-line py-6">
      <Label className="mb-3 text-accent">{title}</Label>
      {children}
    </section>
  );
}

const checkLine = (c: Check) => `${c.status === "pass" ? "✓" : c.status === "info" ? "i" : c.status === "warn" ? "!" : "✗"} ${c.label} — ${c.detail}`;

export function ReportView() {
  const { report: r, pageById } = useTrace();
  const [copied, setCopied] = useState(false);
  const share = typeof window !== "undefined" ? `${window.location.origin}/trace/${r.id}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="mx-auto max-w-4xl p-5 sm:p-8">
      <div className="no-print mb-8 border border-line bg-panel p-5">
        <Label>Trace report</Label>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{r.hostname}</div>
        <div className="mt-1 font-mono text-xs text-mute">TRACE ID: {r.id.toUpperCase()}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Btn variant="primary" onClick={() => window.print()}>Export PDF</Btn>
          <Btn href={`${EXPORT_BASE(r.id)}?format=json`}>JSON</Btn>
          {(["pages", "links", "technologies", "findings", "sources"] as const).map((k) => (
            <Btn key={k} href={`${EXPORT_BASE(r.id)}?format=csv&kind=${k}`}>CSV · {k}</Btn>
          ))}
          {!r.demo && <Btn onClick={copy}>{copied ? "Copied" : "Copy link"}</Btn>}
        </div>
        <p className="mt-3 text-xs text-dim">PDF opens your browser&apos;s print dialog — choose “Save as PDF”. Map images (SVG/PNG) are exported from the Map view. {r.demo ? "Demo data cannot be shared." : "Anyone with the TRACE ID link can open this report; it contains only public crawl data. Reports expire after 7 days."}</p>
      </div>

      <article aria-label="Report">
        <header className="pb-6">
          <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-mute">TRACE — The X-ray for the web</div>
          <h1 className="mt-3 break-all text-4xl font-semibold tracking-tight">{r.hostname}</h1>
          <div className="mt-2 font-mono text-xs text-mute">
            TRACE ID {r.id.toUpperCase()} · {fmtDate(r.createdAt)} · {r.url}
            {r.demo && " · DEMO DATA"}
          </div>
          <p className="mt-3 text-xs text-dim">Generated from publicly accessible content. Classifications marked inferred are heuristic. Performance measured from the TRACE crawler region.</p>
        </header>

        <Block title="Overview">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries({ Pages: r.stats.pages, Sections: r.stats.sections, "Internal links": r.stats.internalLinks, "External links": r.stats.externalLinks, Assets: r.stats.assets, Forms: r.stats.forms, "Tech signals": r.stats.techSignals, Journeys: r.stats.journeys }).map(([k, v]) => (
              <div key={k}><Label>{k}</Label><div className="font-mono text-2xl">{v}</div></div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {r.scores.map((s) => (
              <div key={s.key}><Label>{s.label}</Label><div className="font-mono text-2xl">{s.score}</div></div>
            ))}
          </div>
          {r.notes.partial && <p className="mt-3 text-sm text-mute">Partial crawl: {r.notes.analyzedPages} of {r.notes.requestedPages} requested pages analyzed ({r.notes.stopReason}).</p>}
        </Block>

        <Block title="Website identity">
          <dl className="space-y-1 text-sm">
            <div><dt className="inline text-mute">Title: </dt><dd className="inline">{r.identity.title ?? "Not detected"}</dd></div>
            <div><dt className="inline text-mute">Description: </dt><dd className="inline">{r.identity.description ?? "No meta description detected."}</dd></div>
            <div><dt className="inline text-mute">Canonical: </dt><dd className="inline">{r.identity.canonical ?? "Not detected"}</dd></div>
            <div><dt className="inline text-mute">Language: </dt><dd className="inline">{r.identity.lang ?? "Not detected"}</dd></div>
            <div><dt className="inline text-mute">Crawl policy: </dt><dd className="inline">{r.policy.summary}</dd></div>
          </dl>
        </Block>

        <Block title="Site structure (inferred sections)">
          <ul className="space-y-3 font-mono text-xs">
            {r.sections.map((s) => (
              <li key={s.id}>
                <div className="text-fg">{s.label} <span className="text-dim">· {s.category} · {s.pageIds.length}</span></div>
                {s.pageIds.slice(0, 8).map((id) => <div key={id} className="pl-3 text-mute">├── {pageById.get(id)?.path}</div>)}
                {s.pageIds.length > 8 && <div className="pl-3 text-dim">└── +{s.pageIds.length - 8} more</div>}
              </li>
            ))}
          </ul>
        </Block>

        <Block title="Page statistics">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-line font-mono text-[10px] uppercase tracking-wider text-mute"><th className="py-1 pr-2">Page</th><th className="pr-2">Type</th><th className="pr-2">Depth</th><th className="pr-2">Int</th><th className="pr-2">Ext</th><th>Status</th></tr></thead>
            <tbody>
              {r.pages.slice(0, 60).map((p) => (
                <tr key={p.id} className="border-b border-line/50"><td className="max-w-[18rem] truncate py-1 pr-2 font-mono">{p.path}</td><td className="pr-2">{p.type}</td><td className="pr-2">{p.depth}</td><td className="pr-2">{p.internalLinkCount}</td><td className="pr-2">{p.externalLinkCount}</td><td>{p.status ?? "fail"}</td></tr>
              ))}
            </tbody>
          </table>
        </Block>

        <Block title="Technology">
          {r.technologies.length === 0 ? <p className="text-sm text-mute">Not detected.</p> : (
            <ul className="space-y-2 text-sm">
              {r.technologies.map((t) => (
                <li key={t.name}><span className="font-medium">{t.name}</span> <span className="text-mute">({t.category}, {t.confidence} confidence)</span><div className="font-mono text-[11px] text-dim">{t.signals[0]?.evidence}</div></li>
              ))}
            </ul>
          )}
        </Block>

        {[r.seo, r.a11y, r.perf].map((g) => (
          <Block key={g.key} title={g.label}>
            <p className="mb-2 text-xs text-dim">{g.note}</p>
            <ul className="space-y-1 text-sm">{g.checks.map((c) => <li key={c.id} className="text-mute">{checkLine(c)}</li>)}</ul>
          </Block>
        ))}

        <Block title="What we found">
          <ul className="space-y-3 text-sm">{r.findings.map((f) => <li key={f.id}><div>{f.title}</div><div className="text-xs text-mute">{f.explanation}</div></li>)}</ul>
          {r.findings.length === 0 && <p className="text-sm text-mute">No notable findings.</p>}
        </Block>

        <Block title="Journeys (inferred from navigation and link relationships)">
          {r.journeys.length === 0 ? <p className="text-sm text-mute">No journeys inferred.</p> : (
            <ul className="space-y-4 font-mono text-xs">
              {r.journeys.map((j) => (
                <li key={j.id}><div className="text-fg">{j.name} <span className="text-dim">· {j.confidence}</span></div>{j.steps.map((s, i) => <div key={i} className="pl-3 text-mute">{i === 0 ? "" : "↓ "}{s.label}</div>)}</li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="Sources">
          <ul className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            {r.sources.slice(0, 40).map((d) => <li key={d.domain} className="flex justify-between gap-2 font-mono"><span className="truncate">{d.domain}</span><span className="text-dim">{d.category} · {d.pageIds.length}p</span></li>)}
          </ul>
          {r.sources.length === 0 && <p className="text-sm text-mute">No external domains referenced.</p>}
        </Block>
      </article>
    </div>
  );
}
