"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Label, cx } from "./ui";
import { PHASES, type Phase, type Progress } from "@/lib/trace/types";

const PHASE_LABEL: Record<string, string> = {
  connecting: "CONNECTING",
  discovering: "DISCOVERING",
  crawling: "CRAWLING",
  analyzing: "ANALYZING",
  mapping: "BUILDING MAP",
  tracing: "TRACING RELATIONSHIPS",
  reporting: "GENERATING REPORT",
};

export function CrawlProgress({ progress, id }: { progress: Progress; id: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const idx = PHASES.indexOf(progress.phase as Phase);
  const elapsed = Math.max(0, Math.round((now - progress.startedAt) / 1000));
  const cap = Math.max(1, Math.min(progress.maxPages, progress.discovered || 1));
  const pct = idx >= 3 ? 100 : Math.min(100, Math.round((progress.analyzed / cap) * 100));
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-5xl gap-10 px-5 py-10 md:grid-cols-[1fr_1.1fr] md:items-center">
        <div>
          <Label>Trace {id}</Label>
          <h1 className="mt-4 font-mono text-2xl tracking-[0.2em] sm:text-3xl" aria-live="polite">
            {PHASE_LABEL[progress.phase] ?? "WORKING"}
            <span className="blink text-accent">_</span>
          </h1>
          {progress.message && <p className="mt-2 text-sm text-mute">{progress.message}</p>}
          <ol className="mt-8 space-y-2.5 font-mono text-xs tracking-[0.18em]">
            {PHASES.map((p, i) => (
              <li key={p} className={cx("flex items-center gap-3", i < idx ? "text-fg" : i === idx ? "text-accent" : "text-dim")}>
                <span className="w-4">{i < idx ? "✓" : i === idx ? "→" : "·"}</span>
                {PHASE_LABEL[p]}
                {i === idx && "…"}
              </li>
            ))}
          </ol>
          <div className="mt-8 h-px w-full bg-line">
            <motion.div className="h-px bg-accent" animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-mute">
            {progress.analyzed} fetched · {elapsed}s elapsed
          </div>
          {progress.robots && (
            <div className="mt-6 border border-line p-3">
              <Label>Crawl policy</Label>
              <div className="mt-1 text-sm">{progress.robots}</div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-px border border-line bg-line">
            {[
              ["Pages discovered", progress.discovered],
              ["Pages analyzed", progress.analyzed],
              ["Depth", progress.depth],
              ["External domains", progress.externalDomains],
            ].map(([l, v]) => (
              <div key={l as string} className="bg-bg p-4">
                <Label>{l}</Label>
                <div className="mt-1 text-3xl font-semibold tabular-nums">{v}</div>
              </div>
            ))}
          </div>
          <div aria-hidden className="flex flex-wrap gap-1">
            {Array.from({ length: progress.maxPages }).map((_, i) => (
              <span key={i} className={cx("h-2.5 w-2.5 border transition", i < progress.analyzed ? "border-accent bg-accent" : i < progress.discovered ? "border-dim" : "border-line")} />
            ))}
          </div>
          <div className="border border-line bg-panel p-4">
            <Label className="mb-3">Live crawl</Label>
            <ul className="space-y-1 font-mono text-xs" aria-label="Crawl activity">
              {progress.log.slice(-12).map((l, i) => (
                <li key={`${l.path}-${i}`} className={cx("flex items-center gap-2 truncate", l.state === "ok" ? "text-fg" : l.state === "active" ? "text-accent" : l.state === "blocked" ? "text-warn" : "text-bad")}>
                  <span className="w-3 shrink-0">{l.state === "ok" ? "✓" : l.state === "active" ? "→" : l.state === "blocked" ? "⊘" : "✗"}</span>
                  <span className="truncate">{l.path}</span>
                  <span className="ml-auto shrink-0 text-dim">{l.state === "blocked" ? "robots" : l.code ? l.code : ""}{l.ms ? ` · ${l.ms}ms` : ""}</span>
                </li>
              ))}
              {progress.log.length === 0 && <li className="text-dim">Waiting for first response…</li>}
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
