"use client";
import { useEffect, useRef, useState } from "react";
import { useTrace } from "../TraceContext";
import { Badge, Empty, Label, SectionTitle, cx } from "../ui";

export function FindingsView() {
  const { report, focusKey, pageById, openXray } = useTrace();
  const [open, setOpen] = useState<string | null>(focusKey);
  const ref = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (focusKey) setOpen(focusKey);
    setTimeout(() => ref.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }, [focusKey]);
  const Pages = ({ ids }: { ids: string[] }) =>
    ids.length ? (
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ids.slice(0, 8).map((id) => (
          <button key={id} onClick={() => openXray(id)} className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">
            X-ray {pageById.get(id)?.path}
          </button>
        ))}
        {ids.length > 8 && <span className="px-1 font-mono text-[10px] text-dim">+{ids.length - 8}</span>}
      </div>
    ) : null;
  return (
    <div className="mx-auto max-w-5xl space-y-14 p-5 sm:p-8">
      <section>
        <SectionTitle kicker="Findings" title="WHAT WE FOUND" right={<span className="text-xs text-mute">{report.findings.length} findings derived from crawled data</span>} />
        {report.findings.length === 0 ? (
          <Empty text="No notable findings were derived from this crawl." />
        ) : (
          <ul className="divide-y divide-line border-y border-line">
            {report.findings.map((f) => {
              const isOpen = open === f.id;
              return (
                <li key={f.id} ref={focusKey === f.id ? ref : undefined}>
                  <button onClick={() => setOpen(isOpen ? null : f.id)} aria-expanded={isOpen} className="group flex w-full items-start gap-4 py-5 text-left">
                    <span className={cx("mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full", f.severity === "warning" ? "bg-warn" : f.severity === "notice" ? "bg-accent" : "bg-dim")} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xl leading-snug tracking-tight group-hover:text-accent sm:text-2xl">{f.title}</span>
                      <span className="mt-1 flex gap-2"><Badge>{f.category}</Badge>{f.severity !== "info" && <Badge tone={f.severity === "warning" ? "warn" : "accent"}>{f.severity}</Badge>}</span>
                    </span>
                    <span className="font-mono text-xs text-dim">{isOpen ? "−" : "+"}</span>
                  </button>
                  {isOpen && (
                    <div className="pb-6 pl-6">
                      <p className="max-w-2xl text-sm text-mute">{f.explanation}</p>
                      {f.evidence.length > 0 && (
                        <>
                          <Label className="mb-1 mt-4">Evidence</Label>
                          <ul className="space-y-0.5 font-mono text-xs text-mute">{f.evidence.map((e, i) => <li key={i} className="break-all">{e}</li>)}</ul>
                        </>
                      )}
                      <Pages ids={f.pageIds} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle kicker="Discovery" title="YOU MIGHT HAVE MISSED" />
        {report.missed.length === 0 ? (
          <Empty text="No orphan-like pages, deep pages, hidden relationships or repeated patterns were found." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {report.missed.map((m) => (
              <article key={m.id} className="border border-line bg-panel p-5">
                <Label className="text-warm">{m.kind.replace("-", " ")}</Label>
                <h3 className="mt-2 text-lg font-medium tracking-tight">{m.title}</h3>
                <p className="mt-1 text-sm text-mute">{m.explanation}</p>
                {m.evidence.length > 0 && <ul className="mt-3 space-y-0.5 font-mono text-xs text-dim">{m.evidence.map((e, i) => <li key={i} className="break-all">{e}</li>)}</ul>}
                <Pages ids={m.pageIds} />
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
