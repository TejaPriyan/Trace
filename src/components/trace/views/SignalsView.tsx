"use client";
import { useState } from "react";
import { useTrace } from "../TraceContext";
import { ScoreCards } from "./OverviewView";
import { CoreWebVitalsRisk } from "../CoreWebVitalsRisk";
import { SecurityFixGenerator } from "../SecurityFixGenerator";
import { SiteRecommendations } from "../SiteRecommendations";
import { Label, SectionTitle, cx } from "../ui";
import type { Check, SignalGroup } from "@/lib/trace/types";

const ICON = { pass: "✓", warn: "!", fail: "✗", info: "i" } as const;
const TONE = { pass: "text-ok", warn: "text-warn", fail: "text-bad", info: "text-mute" } as const;

function CheckRow({ c }: { c: Check }) {
  const { pageById, openXray } = useTrace();
  const [open, setOpen] = useState(false);
  const expandable = c.evidence.length > 0;
  return (
    <li className="border-b border-line last:border-0">
      <button onClick={() => expandable && setOpen(!open)} aria-expanded={expandable ? open : undefined} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className={cx("mt-0.5 w-4 shrink-0 text-center font-mono", TONE[c.status])} aria-label={c.status}>{ICON[c.status]}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{c.label}</span>
          <span className="block text-xs text-mute">{c.detail}</span>
        </span>
        {expandable && <span className="font-mono text-[10px] text-dim">{open ? "−" : "+"} evidence</span>}
      </button>
      {open && (
        <div className="space-y-2 bg-panel px-4 pb-4 pl-11">
          <Label>Evidence</Label>
          <ul className="space-y-0.5 font-mono text-xs text-mute">
            {c.evidence.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {c.affected.length > c.evidence.length && <li className="text-dim">+{c.affected.length - c.evidence.length} more pages</li>}
          </ul>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {c.affected.slice(0, 6).map((id) => (
              <button key={id} onClick={() => openXray(id)} className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">
                X-ray {pageById.get(id)?.path}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

export function SignalGroupView({ g }: { g: SignalGroup }) {
  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-mute">{g.note}</p>
      <div className="mb-5 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        {g.metrics.map((m) => (
          <div key={m.label} className="bg-bg p-3">
            <Label>{m.label}</Label>
            <div className="mt-1 truncate font-mono text-sm">{m.value}</div>
          </div>
        ))}
      </div>
      <ul className="border border-line">
        {g.checks.map((c) => (
          <CheckRow key={c.id} c={c} />
        ))}
      </ul>
    </div>
  );
}

export function SignalsView() {
  const { report } = useTrace();
  const [tab, setTab] = useState<"seo" | "a11y" | "perf">("seo");
  const groups = { seo: report.seo, a11y: report.a11y, perf: report.perf };
  return (
    <div className="mx-auto max-w-6xl space-y-10 p-5 sm:p-8">
      <section>
        <SectionTitle kicker="Signals" title="Observable signals" />
        <ScoreCards />
      </section>

      <section>
        <SiteRecommendations report={report} />
      </section>

      <section>
        <CoreWebVitalsRisk report={report} />
      </section>

      <section>
        <SecurityFixGenerator report={report} />
      </section>

      <section>
        <div className="mb-5 flex flex-wrap gap-1" role="tablist" aria-label="Signal groups">
          {(["seo", "a11y", "perf"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx("border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em]", tab === k ? "border-accent bg-accent/10 text-accent" : "border-line text-mute hover:text-fg")}>
              {groups[k].label}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          <SignalGroupView g={groups[tab]} />
        </div>
      </section>
    </div>
  );
}

