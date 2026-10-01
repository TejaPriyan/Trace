"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { Progress, TraceReport } from "@/lib/trace/types";
import { ERROR_COPY, type ErrorCode } from "@/lib/trace/types";
import { addRecent } from "@/lib/trace/recent";
import { CrawlProgress } from "./CrawlProgress";
import { Reveal } from "./Reveal";
import { TraceProvider, VIEWS, useTrace } from "./TraceContext";
import { ThemeToggle } from "./ThemeToggle";
import { GlobalSearch } from "./GlobalSearch";
import { Badge, Btn, Label, cx } from "./ui";
import { OverviewView } from "./views/OverviewView";
import { MapView } from "./views/MapView";
import { PagesView } from "./views/PagesView";
import { JourneysView } from "./views/JourneysView";
import { ContentView } from "./views/ContentView";
import { TechnologyView } from "./views/TechnologyView";
import { SignalsView } from "./views/SignalsView";
import { SourcesView } from "./views/SourcesView";
import { FindingsView } from "./views/FindingsView";
import { ReportView } from "./views/ReportView";
import { PageXray } from "./PageXray";

type State =
  | { kind: "loading" }
  | { kind: "running"; progress: Progress }
  | { kind: "error"; code: string; message: string }
  | { kind: "missing" }
  | { kind: "reveal"; report: TraceReport }
  | { kind: "ready"; report: TraceReport };

export function Workspace({ id }: { id: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let sawRunning = false;
    let failures = 0;

    // 1. Check local session storage first for instantaneous offline/serverless cache load
    try {
      const cached = sessionStorage.getItem(`trace:report:${id}`);
      if (cached) {
        const report = JSON.parse(cached) as TraceReport;
        setState({ kind: "ready", report });
        return;
      }
    } catch {}

    const startStream = async (targetUrl: string) => {
      sawRunning = true;
      setState({
        kind: "running",
        progress: {
          phase: "connecting",
          discovered: 0,
          analyzed: 0,
          queued: 0,
          depth: 0,
          externalDomains: 0,
          maxPages: 25,
          log: [],
          startedAt: Date.now(),
          message: "Connecting to serverless crawler…",
          robots: null,
          error: null,
        },
      });

      try {
        const res = await fetch(`/api/trace/stream?id=${encodeURIComponent(id)}&url=${encodeURIComponent(targetUrl)}`);
        if (cancelled) return;
        if (!res.ok || !res.body) {
          const errJson = await res.json().catch(() => ({}));
          setState({
            kind: "error",
            code: errJson?.error?.code ?? "INTERNAL",
            message: errJson?.error?.message ?? "Failed to trace website.",
          });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";

          for (const part of parts) {
            if (!part.trim()) continue;
            const eventMatch = part.match(/^event:\s*(\w+)/m);
            const dataMatch = part.match(/^data:\s*(.+)$/m);
            const event = eventMatch ? eventMatch[1] : "message";
            if (!dataMatch) continue;

            try {
              const data = JSON.parse(dataMatch[1]);
              if (event === "progress") {
                setState({ kind: "running", progress: data });
              } else if (event === "complete") {
                const report = data.report as TraceReport;
                try {
                  sessionStorage.setItem(`trace:report:${report.id}`, JSON.stringify(report));
                  sessionStorage.removeItem(`trace:pending:${id}`);
                } catch {}
                if (!report.demo) {
                  addRecent({ id: report.id, hostname: report.hostname, pages: report.stats.pages, at: new Date().toISOString() });
                }
                setState({ kind: "reveal", report });
                return;
              } else if (event === "error") {
                setState({ kind: "error", code: data.code ?? "INTERNAL", message: data.message ?? "Trace failed" });
                return;
              }
            } catch {}
          }
        }
      } catch {
        if (cancelled) return;
        setState({ kind: "error", code: "UNREACHABLE", message: "Lost connection to TRACE." });
      }
    };

    const poll = async () => {
      try {
        const res = await fetch(`/api/trace/${id}`, { cache: "no-store" });
        if (cancelled) return;

        if (res.status === 404) {
          // If serverless container has lost in-memory job state, attempt streaming crawl with pending URL
          let targetUrl: string | null = null;
          try {
            const urlParam = new URLSearchParams(window.location.search).get("url");
            if (urlParam) targetUrl = urlParam;
            else {
              const pendingRaw = sessionStorage.getItem(`trace:pending:${id}`);
              if (pendingRaw) {
                const p = JSON.parse(pendingRaw);
                if (p?.url) targetUrl = p.url;
              }
            }
          } catch {}

          if (targetUrl) {
            void startStream(targetUrl);
            return;
          }
          return setState({ kind: "missing" });
        }

        const d = await res.json();
        failures = 0;
        if (d.status === "running") {
          sawRunning = true;
          setState({ kind: "running", progress: d.progress });
          timer = setTimeout(poll, 700);
        } else if (d.status === "failed") {
          setState({ kind: "error", code: d.error?.code ?? "INTERNAL", message: d.error?.message ?? "" });
        } else if (d.status === "complete") {
          const report = d.report as TraceReport;
          try {
            sessionStorage.setItem(`trace:report:${report.id}`, JSON.stringify(report));
            sessionStorage.removeItem(`trace:pending:${id}`);
          } catch {}
          if (!report.demo) addRecent({ id: report.id, hostname: report.hostname, pages: report.stats.pages, at: new Date().toISOString() });
          let showReveal = sawRunning;
          if (report.demo) {
            try {
              showReveal = sessionStorage.getItem("trace.demo.seen") !== "1";
              sessionStorage.setItem("trace.demo.seen", "1");
            } catch {}
          }
          setState({ kind: showReveal ? "reveal" : "ready", report });
        }
      } catch {
        if (cancelled) return;
        if (++failures > 6) return setState({ kind: "error", code: "UNREACHABLE", message: "Lost connection to TRACE." });
        timer = setTimeout(poll, 1500);
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  const finishReveal = useCallback(() => setState((s) => (s.kind === "reveal" ? { kind: "ready", report: s.report } : s)), []);

  if (state.kind === "loading")
    return (
      <main className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-mute">
          Loading<span className="blink">_</span>
        </span>
      </main>
    );
  if (state.kind === "running") return <CrawlProgress progress={state.progress} id={id} />;
  if (state.kind === "missing") return <Problem title="TRACE not found" text="This trace doesn't exist or has expired. Traces are retained for a limited time." />;
  if (state.kind === "error") return <Problem title={ERROR_COPY[state.code as ErrorCode] ?? ERROR_COPY.INTERNAL} text={state.message} code={state.code} />;
  if (state.kind === "reveal") return <Reveal report={state.report} onDone={finishReveal} />;
  return (
    <MotionConfig reducedMotion="user">
      <TraceProvider report={state.report}>
        <Shell />
      </TraceProvider>
    </MotionConfig>
  );
}

function Problem({ title, text, code }: { title: string; text?: string; code?: string }) {
  const router = useRouter();
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative z-10 max-w-lg text-center" role="alert">
        {code && <Label className="text-bad">{code}</Label>}
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {text && <p className="mt-3 text-sm text-mute">{text}</p>}
        <div className="mt-8 flex justify-center gap-2">
          <Btn variant="primary" onClick={() => router.push("/")}>
            New trace
          </Btn>
          <Btn onClick={() => router.push("/trace/demo")}>Explore demo</Btn>
        </div>
      </div>
    </main>
  );
}

function Shell() {
  const { report, view, setView } = useTrace();
  const [collapsed, setCollapsed] = useState(false);
  const body = (() => {
    switch (view) {
      case "overview":
        return <OverviewView />;
      case "map":
        return <MapView />;
      case "pages":
        return <PagesView />;
      case "journeys":
        return <JourneysView />;
      case "content":
        return <ContentView />;
      case "technology":
        return <TechnologyView />;
      case "signals":
        return <SignalsView />;
      case "sources":
        return <SourcesView />;
      case "findings":
        return <FindingsView />;
      case "report":
        return <ReportView />;
    }
  })();
  return (
    <div className="ws-root flex h-dvh flex-col bg-bg">
      <a href="#main" className="no-print sr-only z-50 bg-fg px-3 py-2 font-mono text-xs text-bg focus:not-sr-only focus:absolute focus:left-2 focus:top-2">
        Skip to content
      </a>
      <header className="no-print flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-5">
        <Link href="/" className="font-mono text-[11px] font-semibold uppercase tracking-[0.3em] hover:text-accent">
          Trace
        </Link>
        <span className="hidden h-4 w-px bg-line sm:block" />
        <div className="min-w-0 flex-1 truncate font-mono text-sm sm:flex-none">{report.hostname}</div>
        {report.demo && <Badge tone="warn">Demo data</Badge>}
        <span className="hidden font-mono text-[10px] tracking-widest text-dim lg:block">{report.id.toUpperCase()}</span>
        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-mute sm:inline-block">
            By <span className="font-semibold text-accent">Teja Priyan</span>
          </span>
          <span className="hidden h-3.5 w-px bg-line sm:inline-block" />
          <GlobalSearch />
          <ThemeToggle className="hidden sm:block" />
          <Link href="/" className="whitespace-nowrap border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition hover:border-accent hover:text-accent">
            New trace
          </Link>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className={cx("no-print hidden shrink-0 flex-col border-r border-line py-3 md:flex", collapsed ? "w-14" : "w-44")}>
          <nav aria-label="Primary" className="flex-1">
            <ul>
              {VIEWS.map((v) => (
                <li key={v.key}>
                  <button
                    onClick={() => setView(v.key)}
                    aria-current={view === v.key ? "page" : undefined}
                    title={v.label}
                    className={cx("flex w-full items-center gap-3 px-4 py-2 text-left font-mono text-[11px] uppercase tracking-[0.18em] transition", view === v.key ? "border-l-2 border-accent bg-panel text-fg" : "border-l-2 border-transparent text-mute hover:text-fg")}
                  >
                    {collapsed ? <span>{v.code}</span> : v.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <button onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} className="mx-4 mt-2 border border-line py-1 font-mono text-[10px] text-mute hover:text-accent">
            {collapsed ? "»" : "« Collapse"}
          </button>
        </aside>

        <main id="main" className="ws-scroll relative min-w-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className={view === "map" ? "h-full" : ""}>
              {body}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <nav aria-label="Primary mobile" className="no-print flex shrink-0 overflow-x-auto border-t border-line md:hidden">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} aria-current={view === v.key ? "page" : undefined} className={cx("shrink-0 px-3.5 py-3 font-mono text-[10px] uppercase tracking-[0.14em]", view === v.key ? "border-t-2 border-accent text-fg" : "border-t-2 border-transparent text-mute")}>
            {v.label}
          </button>
        ))}
      </nav>
      <PageXray />
    </div>
  );
}
