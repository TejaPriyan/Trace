"use client";
import { useTrace } from "../TraceContext";
import { Bar, Empty, Inferred, Label, SectionTitle, Stat, sectionColor } from "../ui";

export function ContentView() {
  const { report: r, pageById, openXray } = useTrace();
  const c = r.content;
  const maxType = Math.max(1, ...c.typeCounts.map((t) => t.count));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`.toUpperCase();
  return (
    <div className="mx-auto max-w-6xl space-y-12 p-5 sm:p-8">
      <section>
        <SectionTitle kicker="Content map" title="What the site is made of" right={<Inferred />} />
        <div className="grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {c.typeCounts.slice(0, 8).map((t) => (
            <div key={t.type} className="bg-bg p-4">
              <div className="font-mono text-2xl tabular-nums">{plural(t.count, t.type === "Article" ? "article" : t.type === "Blog" ? "blog index" : t.type === "Unknown" ? "unclassified page" : t.type.toLowerCase() + " page").replace(/ PAGE PAGE/, " PAGE")}</div>
              <div className="mt-2"><Bar value={t.count} max={maxType} /></div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-dim">Page types are heuristic classifications from URL paths and structured data.</p>
      </section>

      <section className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4 lg:grid-cols-7">
        {[
          ["Total words", c.totalWords.toLocaleString()],
          ["Avg words / page", c.avgWords],
          ["Thin pages (<150)", c.thinPages.length],
          ["Images", c.images],
          ["Videos", c.videos],
          ["Audio", c.audios],
          ["Embeds (iframes)", c.iframes],
        ].map(([l, v]) => (
          <div key={l as string} className="bg-bg"><Stat label={l as string} value={v as number} /></div>
        ))}
      </section>

      <section>
        <SectionTitle kicker="Structure" title="Sections" right={<Inferred />} />
        <div className="grid gap-6 md:grid-cols-2">
          {r.sections.map((s) => (
            <div key={s.id} className="border border-line bg-panel p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: sectionColor(s.label) }} />
                <Label className="text-fg">{s.label}</Label>
                <span className="ml-auto text-[11px] text-dim">{s.category} · {s.pageIds.length}</span>
              </div>
              <ul className="mt-3 font-mono text-xs" role="list">
                {s.pageIds.slice(0, 10).map((id, i, a) => {
                  const p = pageById.get(id);
                  return p ? (
                    <li key={id}>
                      <button onClick={() => openXray(id)} className="w-full truncate py-0.5 text-left text-mute hover:text-accent">
                        <span className="text-dim">{i === Math.min(a.length, 10) - 1 && s.pageIds.length <= 10 ? "└── " : "├── "}</span>
                        {p.path}
                      </button>
                    </li>
                  ) : null;
                })}
                {s.pageIds.length > 10 && <li className="py-0.5 text-dim">└── +{s.pageIds.length - 10} more</li>}
              </ul>
              <p className="mt-2 text-[11px] text-dim">Inferred: {s.basis}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <SectionTitle kicker="Navigation" title="Primary navigation" />
          {c.nav.length === 0 ? (
            <Empty text="No navigation links detected." />
          ) : (
            <ul className="divide-y divide-line border border-line">
              {c.nav.map((n) => (
                <li key={n.url} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{n.label || n.url}</span>
                  <span className="hidden truncate font-mono text-[11px] text-dim sm:block">{n.url.replace(/^[^/]*/, "") || "/"}</span>
                  <span className="w-24 shrink-0"><Bar value={n.share} max={1} /></span>
                  <span className="w-10 text-right font-mono text-[11px] text-mute">{Math.round(n.share * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-dim">Share = pages on which the link appears in header/nav areas.</p>
        </div>
        <div>
          <SectionTitle kicker="Calls to action" title="CTAs" />
          {c.ctas.length === 0 ? (
            <Empty text="No calls to action detected." />
          ) : (
            <ul className="divide-y divide-line border border-line">
              {c.ctas.map((t) => (
                <li key={t.text} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 truncate">“{t.text}”</span>
                  <span className="font-mono text-[11px] text-mute">{t.count} page{t.count === 1 ? "" : "s"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-2">
        <div>
          <SectionTitle kicker="Headings" title="Headings by page" />
          <ul className="divide-y divide-line border border-line">
            {c.headingSamples.map((h) => (
              <li key={h.pageId} className="p-3">
                <button onClick={() => openXray(h.pageId)} className="font-mono text-[11px] text-dim hover:text-accent">{pageById.get(h.pageId)?.path}</button>
                <div className="mt-0.5 text-sm">{h.h1 ?? <span className="text-bad">No H1</span>}</div>
                {h.h2.length > 0 && <div className="mt-0.5 text-xs text-mute">{h.h2.join(" · ")}</div>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <SectionTitle kicker="Repetition" title="Repeated content" />
          {c.repeated.length === 0 ? (
            <Empty text="No text blocks repeated across pages were detected." />
          ) : (
            <ul className="divide-y divide-line border border-line">
              {c.repeated.map((t, i) => (
                <li key={i} className="p-3 text-sm">
                  <div className="text-mute">“{t.text}”</div>
                  <div className="mt-1 font-mono text-[11px] text-dim">on {t.count} pages</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
