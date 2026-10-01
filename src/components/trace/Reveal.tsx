"use client";
import { useEffect } from "react";
import { motion } from "framer-motion";
import type { TraceReport } from "@/lib/trace/types";
import { Label } from "./ui";

export function Reveal({ report, onDone }: { report: TraceReport; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3800);
    return () => clearTimeout(t);
  }, [onDone]);
  const s = report.stats;
  const rows: [number, string][] = [
    [s.pages, "PAGES"],
    [s.sections, "SECTIONS"],
    [s.internalLinks, "INTERNAL LINKS"],
    [s.externalLinks, "EXTERNAL LINKS"],
    [s.techSignals, "TECHNOLOGY SIGNALS"],
    [s.journeys, "USER JOURNEYS"],
    [s.findings, "FINDINGS"],
  ];
  return (
    <main className="relative flex min-h-screen cursor-pointer items-center justify-center overflow-hidden" onClick={onDone} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " " || e.key === "Escape") && onDone()} aria-label="Continue to workspace">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative z-10 px-6">
        {report.demo && <Label className="mb-4 text-warm">Demo data</Label>}
        <motion.h1 initial={{ opacity: 0, letterSpacing: "0.6em" }} animate={{ opacity: 1, letterSpacing: "0.2em" }} transition={{ duration: 0.8 }} className="font-mono text-2xl sm:text-4xl">
          TRACE COMPLETE
        </motion.h1>
        <div className="mt-2 font-mono text-xs tracking-widest text-mute">{report.hostname}</div>
        <ul className="mt-10 space-y-2">
          {rows.map(([n, l], i) => (
            <motion.li key={l} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + i * 0.22, duration: 0.35 }} className="flex items-baseline gap-4 font-mono">
              <span className="w-20 text-right text-3xl font-semibold tabular-nums sm:text-4xl">{n}</span>
              <span className="text-xs tracking-[0.25em] text-mute">{l}</span>
            </motion.li>
          ))}
        </ul>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.4 }} className="mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-accent">
          Assembling the map… (click to skip)
        </motion.div>
      </div>
    </main>
  );
}
