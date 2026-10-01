"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import { Badge, Btn, Label, SectionTitle, cx } from "./ui";
import { getRecent, type RecentTrace } from "@/lib/trace/recent";
import type { TraceReport } from "@/lib/trace/types";

async function loadReport(input: string, status: (s: string) => void): Promise<TraceReport> {
  const t = input.trim();
  let id: string;
  if (/^demo$/i.test(t)) id = "demo";
  else if (/^TRC-[0-9A-Za-z]{8}$/.test(t)) id = t.toUpperCase();
  else {
    status("Validating…");
    const res = await fetch("/api/trace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: t }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d?.error?.detail ? `${d.error.message} (${d.error.detail})` : d?.error?.message ?? "Request failed");
    id = d.existing ? d.existing.id : d.id;
  }
  for (let i = 0; i < 300; i++) {
    const res = await fetch(`/api/trace/${id}`, { cache: "no-store" });
    if (res.status === 404) throw new Error("Trace not found");
    const d = await res.json();
    if (d.status === "complete") return d.report as TraceReport;
    if (d.status === "failed") throw new Error(d.error?.message ?? "Trace failed");
    status(`${d.progress.phase} · ${d.progress.analyzed} pages`);
    await new Promise((r) => setTimeout(r, 900));
  }
  throw new Error("Timed out waiting for trace");
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

interface Metric {
  label: string;
  a: number;
  b: number;
  fmt?: (n: number) => string;
}

function metrics(a: TraceReport, b: TraceReport): Metric[] {
  const med = (r: TraceReport) => {
    const s = r.pages.filter((p) => p.status && p.status < 400).map((p) => p.responseMs).sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const okp = (r: TraceReport) => r.pages.filter((p) => p.status !== null && p.status < 400);
  const m = (label: string, f: (r: TraceReport) => number, fmt?: (n: number) => string): Metric => ({ label, a: f(a), b: f(b), fmt });
  return [
    m("Pages analyzed", (r) => r.stats.pages),
    m("Sections (inferred)", (r) => r.stats.sections),
    m("Max navigation depth", (r) => r.stats.maxDepth),
    m("Internal links", (r) => r.stats.internalLinks),
    m("External links", (r) => r.stats.externalLinks),
    m("External domains", (r) => r.stats.externalDomains),
    m("Forms", (r) => r.stats.forms),
    m("Technology signals", (r) => r.stats.techSignals),
    m("User journeys (inferred)", (r) => r.stats.journeys),
    m("Avg words / page", (r) => r.content.avgWords),
    m("Pages with meta description", (r) => pct(okp(r).filter((p) => p.description).length, okp(r).length), (n) => n + "%"),
    m("Pages with H1", (r) => pct(okp(r).filter((p) => p.headings.some((h) => h.level === 1 && h.text)).length, okp(r).length), (n) => n + "%"),
    m("Images missing alt", (r) => okp(r).reduce((x, p) => x + p.images.filter((i) => i.alt === null).length, 0)),
    m("Median response (ms)", med),
    m("Broken pages", (r) => r.stats.brokenPages),
    ...(["structure", "content", "seo", "a11y", "perf"] as const).map((k) => m(`${a.scores.find((s) => s.key === k)?.label ?? k} score`, (r) => r.scores.find((s) => s.key === k)?.score ?? 0)),
  ];
}

function diffs(a: TraceReport, b: TraceReport): string[] {
  const A = a.hostname;
  const B = b.hostname;
  const out: string[] = [];
  const cmp = (x: number, y: number, more: string, same: string, fmt = (n: number) => String(n)) => {
    if (x === y) out.push(same);
    else out.push(`${x > y ? A : B} ${more} (${fmt(x)} vs ${fmt(y)}).`);
  };
  cmp(a.stats.maxDepth, b.stats.maxDepth, "has deeper navigation", `Both sites reach the same maximum depth (${a.stats.maxDepth}).`);
  if (a.stats.maxDepth !== b.stats.maxDepth) out[out.length - 1] = `${a.stats.maxDepth > b.stats.maxDepth ? A : B} has deeper navigation (max depth ${a.stats.maxDepth} vs ${b.stats.maxDepth}).`;
  cmp(a.stats.pages, b.stats.pages, "has more analyzed pages", `Both analyzed ${a.stats.pages} pages.`);
  if (a.stats.pages !== b.stats.pages) out[out.length - 1] = `${a.stats.pages > b.stats.pages ? A : B} has more analyzed pages (${a.stats.pages} vs ${b.stats.pages}).`;
  const la = new Set(a.sections.map((s) => s.label));
  const lb = new Set(b.sections.map((s) => s.label));
  const shared = [...la].filter((x) => lb.has(x));
  out.push(`Sections: ${shared.length} shared${shared.length ? ` (${shared.slice(0, 5).join(", ")})` : ""}; ${[...la].filter((x) => !lb.has(x)).length} only on ${A}; ${[...lb].filter((x) => !la.has(x)).length} only on ${B}.`);
  const ta = new Set(a.technologies.map((t) => t.name));
  const tb = new Set(b.technologies.map((t) => t.name));
  const onlyA = [...ta].filter((x) => !tb.has(x));
  const onlyB = [...tb].filter((x) => !ta.has(x));
  out.push(`Technologies: ${[...ta].filter((x) => tb.has(x)).length} in common. Only ${A}: ${onlyA.slice(0, 6).join(", ") || "none"}. Only ${B}: ${onlyB.slice(0, 6).join(", ") || "none"}.`);
  const da = new Set(a.sources.map((s) => s.domain));
  const db = new Set(b.sources.map((s) => s.domain));
  const sd = [...da].filter((x) => db.has(x));
  out.push(`External services: ${sd.length} shared domain${sd.length === 1 ? "" : "s"}${sd.length ? ` (${sd.slice(0, 5).join(", ")})` : ""}; ${da.size - sd.length} only on ${A}; ${db.size - sd.length} only on ${B}.`);
  const types = new Set([...a.content.typeCounts.map((t) => t.type), ...b.content.typeCounts.map((t) => t.type)]);
  const tdiff = [...types].map((t) => ({ t, x: a.content.typeCounts.find((c) => c.type === t)?.count ?? 0, y: b.content.typeCounts.find((c) => c.type === t)?.count ?? 0 })).filter((d) => d.x !== d.y).sort((p, q) => Math.abs(q.x - q.y) - Math.abs(p.x - p.y)).slice(0, 3);
  for (const d of tdiff) out.push(`${d.x > d.y ? A : B} has more ${d.t} pages (${d.x} vs ${d.y}).`);
  const ja = new Set(a.journeys.map((j) => j.name));
  const jb = new Set(b.journeys.map((j) => j.name));
  const jo = [...ja].filter((x) => !jb.has(x));
  const jp = [...jb].filter((x) => !ja.has(x));
  if (jo.length || jp.length) out.push(`Inferred journeys found only on ${A}: ${jo.join(", ") || "none"}. Only on ${B}: ${jp.join(", ") || "none"}.`);
  const da1 = avg(a.pages.filter((p) => p.status && p.status < 400).map((p) => p.internalLinkCount));
  const db1 = avg(b.pages.filter((p) => p.status && p.status < 400).map((p) => p.internalLinkCount));
  out.push(`${da1 >= db1 ? A : B} has more internal links per page (${(da1 >= db1 ? da1 : db1).toFixed(1)} vs ${(da1 >= db1 ? db1 : da1).toFixed(1)}).`);
  return out;
}

const PRESET_PAIRS = [
  { label: "Demo vs example.com", a: "demo", b: "example.com" },
  { label: "Stripe vs Lemon Squeezy", a: "https://stripe.com", b: "https://lemonsqueezy.com" },
  { label: "Vercel vs Netlify", a: "https://vercel.com", b: "https://netlify.com" },
];

export function Compare() {
  const [va, setVa] = useState("");
  const [vb, setVb] = useState("");
  const [busy, setBusy] = useState(false);
  const [sa, setSa] = useState("");
  const [sb, setSb] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<[TraceReport, TraceReport] | null>(null);
  const [recent, setRecent] = useState<RecentTrace[]>([]);
  useEffect(() => setRecent(getRecent()), []);

  async function run() {
    setErr(null);
    setRes(null);
    if (!va.trim() || !vb.trim()) return setErr("Enter two websites (or TRACE IDs) to compare.");
    setBusy(true);
    try {
      const [a, b] = await Promise.all([loadReport(va, setSa), loadReport(vb, setSb)]);
      setRes([a, b]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setBusy(false);
      setSa("");
      setSb("");
    }
  }

  const ms = useMemo(() => (res ? metrics(res[0], res[1]) : []), [res]);
  const notes = useMemo(() => (res ? diffs(res[0], res[1]) : []), [res]);

  const picker = (value: string, set: (v: string) => void, label: string, status: string) => (
    <div>
      <label htmlFor={label} className="block"><Label>{label}</Label></label>
      <input id={label} value={value} onChange={(e) => set(e.target.value)} placeholder="https://example.com, TRC-XXXXXXXX or demo" autoComplete="off" spellCheck={false} className="mt-1 w-full border border-line bg-panel px-3 py-3 font-mono text-sm outline-none placeholder:text-dim focus:border-accent" />
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => set("demo")} className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">demo</button>
        {recent.slice(0, 3).map((r) => (
          <button type="button" key={r.id} onClick={() => set(r.id)} className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">{r.hostname}</button>
        ))}
      </div>
      {status && <div className="mt-1 font-mono text-[11px] text-accent" aria-live="polite">{status}</div>}
    </div>
  );

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <Link href="/" className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] hover:text-accent">Trace</Link>
        <div className="flex gap-2"><ThemeToggle /></div>
      </header>
      <div className="mx-auto max-w-6xl p-5 sm:p-8">
        <SectionTitle kicker="Compare" title="COMPARE WEBSITES" />
        <p className="mb-4 max-w-2xl text-sm text-mute">Trace two public websites and see how their structure, technologies and signals differ. TRACE describes differences — it does not rank sites. New traces can take up to a minute.</p>
        
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Label className="mr-1">Quick presets:</Label>
          {PRESET_PAIRS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setVa(p.a);
                setVb(p.b);
              }}
              className="border border-line px-2 py-1 font-mono text-[10px] text-mute transition hover:border-accent hover:text-accent"
            >
              {p.label}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="grid gap-4 sm:grid-cols-2">
          {picker(va, setVa, "Site A", sa)}
          {picker(vb, setVb, "Site B", sb)}
          <div className="sm:col-span-2"><Btn type="submit" variant="primary" disabled={busy} className="w-full py-3">{busy ? "Tracing…" : "Compare"}</Btn></div>
        </form>
        {err && <div role="alert" className="mt-4 border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">{err}</div>}

        {res && (
          <div className="mt-10 space-y-10">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-4 border-b border-line pb-4">
              {res.map((r, i) => (
                <div key={i} className={i === 1 ? "text-right" : ""}>
                  <Label>{i === 0 ? "Site A" : "Site B"}</Label>
                  <div className="break-all text-2xl font-semibold tracking-tight sm:text-4xl">{r.hostname}</div>
                  <div className="mt-1 flex gap-2 font-mono text-[10px] text-mute" style={{ justifyContent: i === 1 ? "flex-end" : "flex-start" }}>
                    {r.demo && <Badge tone="warn">Demo data</Badge>}
                    <span>{r.id.toUpperCase()}</span>
                  </div>
                  {i === 0 && <span className="sr-only">versus</span>}
                </div>
              )).flatMap((el, i) => (i === 0 ? [el, <div key="vs" className="pb-2 font-mono text-xs text-dim">VS</div>] : [el]))}
            </div>

            <section>
              <Label className="mb-3 text-accent">Side by side</Label>
              <ul className="divide-y divide-line border border-line">
                {ms.map((m) => {
                  const max = Math.max(m.a, m.b, 1);
                  const f = m.fmt ?? ((n: number) => String(n));
                  return (
                    <li key={m.label} className="grid grid-cols-[1fr_minmax(0,1.2fr)_1fr] items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 flex-1 sm:block"><div className="ml-auto h-full bg-accent" style={{ width: `${(m.a / max) * 100}%` }} /></div>
                        <span className="font-mono text-lg tabular-nums">{f(m.a)}</span>
                      </div>
                      <div className="text-center font-mono text-[10px] uppercase tracking-wider text-mute">{m.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg tabular-nums">{f(m.b)}</span>
                        <div className="hidden h-1.5 flex-1 sm:block"><div className="h-full bg-warm" style={{ width: `${(m.b / max) * 100}%` }} /></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Unified Tech Stack Diff Matrix */}
            <section className="border border-line bg-panel p-5 space-y-4">
              <Label className="text-accent">Technology Stack Overlap Matrix</Label>
              {(() => {
                const ta = new Set(res[0].technologies.map((t) => t.name));
                const tb = new Set(res[1].technologies.map((t) => t.name));
                const shared = [...ta].filter((x) => tb.has(x));
                const onlyA = [...ta].filter((x) => !tb.has(x));
                const onlyB = [...tb].filter((x) => !ta.has(x));
                return (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="border border-line bg-bg p-3 space-y-2">
                      <Label className="text-accent">Shared by both ({shared.length})</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {shared.length ? shared.map((t) => <Badge key={t} tone="ok">{t}</Badge>) : <span className="text-xs text-mute">None</span>}
                      </div>
                    </div>
                    <div className="border border-line bg-bg p-3 space-y-2">
                      <Label>Only on {res[0].hostname} ({onlyA.length})</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {onlyA.length ? onlyA.map((t) => <Badge key={t} tone="accent">{t}</Badge>) : <span className="text-xs text-mute">None</span>}
                      </div>
                    </div>
                    <div className="border border-line bg-bg p-3 space-y-2">
                      <Label>Only on {res[1].hostname} ({onlyB.length})</Label>
                      <div className="flex flex-wrap gap-1.5">
                        {onlyB.length ? onlyB.map((t) => <Badge key={t} tone="warn">{t}</Badge>) : <span className="text-xs text-mute">None</span>}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </section>

            <section>
              <Label className="mb-3 text-accent">Structural differences</Label>
              <ul className="space-y-2.5 border-l border-line pl-4 text-sm">
                {notes.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
              <p className="mt-4 text-[11px] text-dim">Scores follow transparent rule sets (open either report and click a score to see why). Differences reflect what each crawl observed within its page limits, which may differ between the two traces.</p>
            </section>

            <div className="grid gap-6 md:grid-cols-2">
              {res.map((r, i) => (
                <div key={i} className="border border-line p-4">
                  <Label>{r.hostname} — technologies</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">{r.technologies.length ? r.technologies.map((t) => <Badge key={t.name} tone={res[1 - i].technologies.some((x) => x.name === t.name) ? "neutral" : "accent"}>{t.name}</Badge>) : <span className="text-xs text-mute">Not detected</span>}</div>
                  <Label className="mt-4">Sections</Label>
                  <div className="mt-2 flex flex-wrap gap-1.5">{r.sections.map((s) => <Badge key={s.id} tone={res[1 - i].sections.some((x) => x.label === s.label) ? "neutral" : "accent"}>{s.label}</Badge>)}</div>
                  <p className="mt-3 text-[11px] text-dim">Highlighted = not present on the other site.</p>
                  <Link href={`/trace/${r.id}`} className={cx("mt-3 inline-block font-mono text-[10px] uppercase tracking-wider text-mute underline hover:text-accent")}>Open full workspace →</Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="mt-12 border-t border-line px-5 py-4 text-right font-mono text-[11px] uppercase tracking-wider sm:px-8">
        <span className="text-mute">By </span>
        <span className="font-semibold text-accent">Teja Priyan</span>
      </footer>
    </main>
  );
}



