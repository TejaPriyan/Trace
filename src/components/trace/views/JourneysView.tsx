"use client";
import { useTrace } from "../TraceContext";
import { ConfBadge, Empty, Inferred, Label, SectionTitle } from "../ui";

export function JourneysView() {
  const { report, openXray } = useTrace();
  return (
    <div className="mx-auto max-w-6xl p-5 sm:p-8">
      <SectionTitle kicker="Journeys" title="Likely user journeys" right={<Inferred />} />
      <p className="mb-8 max-w-2xl text-sm text-mute">Inferred from navigation and link relationships. These are paths a visitor could follow through real links — not necessarily the journeys the site intends.</p>
      {report.journeys.length === 0 ? (
        <Empty title="No journeys inferred" text="Not enough classified pages connected by links (for example Product → Pricing → Sign up) were found to infer a journey." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {report.journeys.map((j) => (
            <article key={j.id} className="border border-line bg-panel p-5" aria-label={j.name}>
              <div className="flex items-center justify-between gap-2">
                <Label className="text-fg">{j.name}</Label>
                <ConfBadge c={j.confidence} />
              </div>
              <ol className="mt-5">
                {j.steps.map((s, i) => (
                  <li key={i} className="relative pl-7">
                    <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-accent bg-bg" aria-hidden />
                    {i < j.steps.length - 1 && <span className="absolute left-[4.5px] top-4 h-[calc(100%-4px)] w-px bg-line" aria-hidden />}
                    <div className="pb-5">
                      {s.pageId ? (
                        <button onClick={() => openXray(s.pageId)} className="text-left font-mono text-xs hover:text-accent">
                          {s.label}
                        </button>
                      ) : (
                        <div className="font-mono text-xs text-warm">{s.label}</div>
                      )}
                      {s.note && <div className="mt-0.5 text-[11px] text-dim">{s.note}</div>}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-dim">{j.basis}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
