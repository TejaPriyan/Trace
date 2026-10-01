"use client";
import { useEffect, useState } from "react";
import { useTrace } from "../TraceContext";
import { Badge, Btn, ExtLink, Label, SectionTitle, Stat, cx, fmtDate, safeHref } from "../ui";
import type { ScoreBreakdown } from "@/lib/trace/types";

export function ScoreCards() {
  const { report } = useTrace();
  const [open, setOpen] = useState<ScoreBreakdown | null>(null);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <>
      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {report.scores.map((s) => {
          const tone = s.score >= 85 ? "text-ok" : s.score >= 65 ? "text-warn" : "text-bad";
          return (
            <button key={s.key} onClick={() => setOpen(s)} className="group bg-bg p-4 text-left transition hover:bg-panel" aria-label={`${s.label} score ${s.score}. Show why.`}>
              <Label>{s.label}</Label>
              <div className={cx("mt-2 text-4xl font-semibold tabular-nums", tone)}>{s.score}</div>
              <div className="mt-2 h-1 w-full bg-panel2">
                <div className="h-full bg-current" style={{ width: `${s.score}%`, color: "var(--fg)" }} />
              </div>
              <div className="mt-2 font-mono text-[10px] uppercase tracking-wider text-mute group-hover:text-accent">Why? →</div>
            </button>
          );
        })}
      </div>
      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Why ${open.label} is ${open.score}`} onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-xl overflow-auto border border-line bg-bg p-6">
            <div className="flex items-start justify-between">
              <div>
                <Label>{open.label}</Label>
                <div className="text-5xl font-semibold tabular-nums">{open.score}</div>
              </div>
              <button autoFocus onClick={() => setOpen(null)} aria-label="Close" className="font-mono text-mute hover:text-fg">✕</button>
            </div>
            <Label className="mb-2 mt-6 text-accent">Why?</Label>
            <ul className="space-y-2 text-sm">
              {open.items.length === 0 && <li className="text-mute">No checks were applicable.</li>}
              {open.items.map((it, i) => (
                <li key={i} className="flex gap-3">
                  <span className={cx("w-4 shrink-0 font-mono", it.sign === "+" ? "text-ok" : "text-bad")}>{it.sign}</span>
                  <span className="text-mute">
                    {it.text}
                    {it.sign === "-" && <span className="ml-2 font-mono text-[11px] text-bad">−{it.points} pts</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-line pt-3 text-xs text-dim">{open.method}</p>
          </div>
        </div>
      )}
    </>
  );
}

export function OverviewView() {
  const { report: r, goto, openXray } = useTrace();
  const id = r.identity;
  const s = r.stats;
  const og = id.og;
  const ogImage = safeHref(og["og:image"]);
  return (
    <div className="mx-auto max-w-6xl space-y-10 p-5 sm:p-8">
      {r.demo && (
        <div role="note" className="border border-warn/50 bg-warn/5 px-4 py-3 text-sm">
          <span className="font-mono text-xs uppercase tracking-widest text-warn">Demo data</span>
          <span className="ml-3 text-mute">A bundled sample dataset about a fictional site. It was not freshly crawled.</span>
        </div>
      )}
      {r.notes.partial && (
        <div role="note" className="border border-line bg-panel px-4 py-3 text-sm text-mute">
          <span className="font-mono text-xs uppercase tracking-widest text-warm">Partial crawl</span>
          <span className="ml-3">TRACE analyzed {r.notes.analyzedPages} of {r.notes.requestedPages} requested pages before stopping ({r.notes.stopReason}). Totals are a lower bound.</span>
        </div>
      )}
      {r.notes.jsRenderingNote && (
        <div role="note" className="border border-line bg-panel px-4 py-3 text-sm text-mute">
          <span className="font-mono text-xs uppercase tracking-widest text-warm">JavaScript required</span>
          <span className="ml-3">{r.notes.jsRenderingNote}</span>
        </div>
      )}

      <header>
        <Label>Website</Label>
        <h1 className="mt-1 break-all text-4xl font-semibold tracking-tight sm:text-6xl">{r.hostname}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-mute">
          <span>TRACE ID {r.id.toUpperCase()}</span>
          <span>·</span>
          <span>{fmtDate(r.createdAt)}</span>
          <span>·</span>
          <span>{(r.durationMs / 1000).toFixed(1)}s crawl</span>
          <span>·</span>
          <ExtLink href={r.url}>{r.url}</ExtLink>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
        {[
          ["Pages", s.pages, () => goto("pages")],
          ["Sections", s.sections, () => goto("content")],
          ["Internal links", s.internalLinks, () => goto("map")],
          ["External links", s.externalLinks, () => goto("sources")],
          ["Assets", s.assets, undefined],
          ["Forms", s.forms, undefined],
          ["Technology signals", s.techSignals, () => goto("technology")],
          ["User journeys", s.journeys, () => goto("journeys")],
        ].map(([l, v, f]) => (
          <div key={l as string} className="bg-bg">
            <Stat label={l as string} value={v as number} onClick={f as (() => void) | undefined} />
          </div>
        ))}
      </div>

      <section>
        <SectionTitle kicker="Health" title="Website health" right={<span className="text-xs text-mute">Scores come from transparent rules — click one to see why.</span>} />
        <ScoreCards />
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle kicker="Identity" title="Website identity" />
          <dl className="divide-y divide-line border border-line">
            {[
              ["Website title", id.title],
              ["Description", id.description ?? "No meta description detected."],
              ["Canonical", id.canonical],
              ["Language", id.lang],
            ].map(([k, v]) => (
              <div key={k as string} className="grid grid-cols-[110px_1fr] gap-3 p-3">
                <dt><Label>{k}</Label></dt>
                <dd className="break-words text-sm">{(v as string | null) ?? <span className="text-mute">Not detected</span>}</dd>
              </div>
            ))}
            <div className="grid grid-cols-[110px_1fr] gap-3 p-3">
              <dt><Label>Favicon</Label></dt>
              <dd className="flex items-center gap-2 text-sm">
                {id.favicon && safeHref(id.favicon.url) && id.favicon.accessible !== false ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={id.favicon.url} alt="" width={20} height={20} referrerPolicy="no-referrer" className="h-5 w-5 border border-line" onError={(e) => (e.currentTarget.style.display = "none")} />
                    <span className="text-mute">{id.favicon.accessible ? "Accessible" : "Declared"}</span>
                  </>
                ) : (
                  <span className="text-mute">Not detected</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
        <div>
          <SectionTitle kicker="Social" title="Social preview" />
          {Object.keys(og).length === 0 && Object.keys(id.twitter).length === 0 ? (
            <div className="border border-dashed border-line p-6 text-sm text-mute">No Open Graph or Twitter metadata detected on the start page.</div>
          ) : (
            <div className="border border-line">
              {ogImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ogImage} alt="Open Graph preview image" referrerPolicy="no-referrer" className="max-h-48 w-full border-b border-line bg-panel2 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
              )}
              <div className="space-y-1 p-4">
                <div className="font-mono text-[10px] uppercase tracking-wider text-mute">{r.hostname}</div>
                <div className="text-sm font-medium">{og["og:title"] ?? "No og:title"}</div>
                <div className="text-xs text-mute">{og["og:description"] ?? "No og:description"}</div>
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {og["og:type"] && <Badge>og:type {og["og:type"]}</Badge>}
                  {id.twitter["twitter:card"] && <Badge>twitter:card {id.twitter["twitter:card"]}</Badge>}
                </div>
              </div>
            </div>
          )}
          <div className="mt-6 border border-line p-4">
            <Label>Crawl policy</Label>
            <p className="mt-1 text-sm">{r.policy.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{r.policy.robotsFound ? "robots.txt detected" : "No robots.txt"}</Badge>
              <Badge>{r.policy.sitemapUrlCount === null ? "No sitemap detected" : `Sitemap · ${r.policy.sitemapUrlCount} URLs`}</Badge>
              {r.policy.crawlDelaySec !== null && <Badge>Crawl-delay {r.policy.crawlDelaySec}s</Badge>}
            </div>
            <p className="mt-2 text-[11px] text-dim">TRACE honors robots.txt rules but does not make legal compliance claims.</p>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle kicker="Findings" title="What we found" right={<Btn onClick={() => goto("findings")}>All findings →</Btn>} />
        {r.findings.length === 0 ? (
          <div className="border border-dashed border-line p-6 text-sm text-mute">No notable findings were derived from this crawl.</div>
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {r.findings.slice(0, 5).map((f) => (
              <li key={f.id}>
                <button onClick={() => goto("findings", f.id)} className="group flex w-full items-start gap-4 py-4 text-left">
                  <span className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", f.severity === "warning" ? "bg-warn" : f.severity === "notice" ? "bg-accent" : "bg-dim")} />
                  <span className="text-lg leading-snug tracking-tight group-hover:text-accent sm:text-xl">{f.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {r.missed.length > 0 && (
        <section>
          <SectionTitle kicker="Discovery" title="You might have missed" />
          <div className="grid gap-3 md:grid-cols-3">
            {r.missed.slice(0, 3).map((m) => (
              <button key={m.id} onClick={() => (m.pageIds[0] ? openXray(m.pageIds[0]) : goto("findings"))} className="border border-line bg-panel p-4 text-left transition hover:border-accent">
                <Label className="text-warm">{m.kind.replace("-", " ")}</Label>
                <div className="mt-2 text-sm font-medium">{m.title}</div>
                <p className="mt-1 text-xs text-mute">{m.explanation}</p>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
