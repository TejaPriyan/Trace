"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ThemeToggle } from "./ThemeToggle";
import { Btn, Label, cx, fmtDate } from "./ui";
import { DEFAULT_SETTINGS, LIMITS } from "@/lib/trace/limits";
import type { CrawlSettings } from "@/lib/trace/types";
import { getRecent, type RecentTrace } from "@/lib/trace/recent";

const FEATURES = [
  ["MAP", "Understand the architecture."],
  ["TRACE", "Follow relationships and evidence."],
  ["INSPECT", "Explore every page."],
  ["COMPARE", "See how two websites differ."],
];

export function Landing() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ message: string; detail?: string } | null>(null);
  const [existing, setExisting] = useState<{ id: string; createdAt: string } | null>(null);
  const [adv, setAdv] = useState(false);
  const [settings, setSettings] = useState<CrawlSettings>(DEFAULT_SETTINGS);
  const [recent, setRecent] = useState<RecentTrace[]>([]);
  useEffect(() => setRecent(getRecent()), []);

  async function submit(force = false) {
    setErr(null);
    if (!url.trim()) {
      setErr({ message: "That doesn't look like a valid public URL.", detail: "Enter a website address first." });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/trace", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url, settings, force }) });
      const data = await res.json();
      if (!res.ok) {
        setErr({ message: data?.error?.message ?? "Something went wrong.", detail: data?.error?.detail });
        setBusy(false);
        return;
      }
      if (data.existing) {
        setExisting(data.existing);
        setBusy(false);
        return;
      }
      try {
        sessionStorage.setItem(`trace:pending:${data.id}`, JSON.stringify({ url, settings }));
      } catch {}
      router.push(`/trace/${data.id}?url=${encodeURIComponent(url)}`);
    } catch {
      setErr({ message: "TRACE couldn't reach its server.", detail: "Check your connection and try again." });
      setBusy(false);
    }
  }

  const num = (k: keyof CrawlSettings, min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={settings[k] as number}
      onChange={(e) => setSettings({ ...settings, [k]: Math.min(max, Math.max(min, Number(e.target.value) || min)) })}
      className="w-full border border-line bg-bg px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
    />
  );

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em]">Trace</span>
        <nav className="flex items-center gap-2">
          <Link href="/compare" className="border border-line px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-mute transition hover:border-accent hover:text-accent">
            Compare
          </Link>
          <ThemeToggle />
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 pb-16 pt-8 text-center">
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="text-[22vw] font-semibold leading-none tracking-[-0.06em] sm:text-[9.5rem]">
          TRACE
        </motion.h1>
        <h2 className="mt-4 font-mono text-xs uppercase tracking-[0.35em] text-accent sm:text-sm">The X-ray for the web.</h2>
        <p className="mt-6 max-w-xl text-balance text-base leading-relaxed text-mute sm:text-lg">
          Enter a public website and explore its structure, content, relationships, technologies, journeys and signals through one interactive map.
        </p>

        <form
          className="mt-10 w-full"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="url" className="sr-only">
            Website URL
          </label>
          <input
            id="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            inputMode="url"
            aria-invalid={!!err}
            aria-describedby={err ? "url-err" : undefined}
            className={cx("w-full border bg-panel px-5 py-4 font-mono text-base outline-none transition placeholder:text-dim focus:border-accent sm:text-lg", err ? "border-bad" : "border-line")}
          />
          {err && (
            <div id="url-err" role="alert" className="mt-3 border border-bad/40 bg-bad/5 px-4 py-3 text-left text-sm">
              <div className="text-bad">{err.message}</div>
              {err.detail && <div className="mt-0.5 text-xs text-mute">{err.detail}</div>}
            </div>
          )}

          {existing && (
            <div role="status" className="mt-3 border border-accent/40 bg-accent/5 px-4 py-4 text-left">
              <Label className="text-accent">Existing TRACE available</Label>
              <p className="mt-1 text-sm text-mute">This website was traced on {fmtDate(existing.createdAt)}. Open it, or run a fresh trace.</p>
              <div className="mt-3 flex gap-2">
                <Btn variant="primary" onClick={() => router.push(`/trace/${existing.id}`)}>
                  Open existing
                </Btn>
                <Btn
                  onClick={() => {
                    setExisting(null);
                    void submit(true);
                  }}
                >
                  Trace again
                </Btn>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full bg-fg px-6 py-4 font-mono text-sm uppercase tracking-[0.3em] text-bg transition hover:bg-accent hover:text-[var(--accent-ink)] disabled:opacity-50"
          >
            {busy ? "Validating…" : "Trace website"}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-1 text-xs text-mute">
          <span>Public websites only.</span>
          <span>
            Try:{" "}
            <button type="button" onClick={() => setUrl("example.com")} className="font-mono text-fg underline decoration-line underline-offset-4 hover:text-accent">
              example.com
            </button>
          </span>
        </div>

        <button type="button" onClick={() => setAdv(!adv)} aria-expanded={adv} className="mt-6 font-mono text-[10px] uppercase tracking-[0.2em] text-mute hover:text-accent">
          {adv ? "− Hide" : "+ Crawl settings"}
        </button>
        {adv && (
          <div className="mt-3 grid w-full grid-cols-2 gap-3 border border-line bg-panel p-4 text-left sm:grid-cols-3">
            <div className="col-span-full flex flex-wrap items-center gap-2 border-b border-line pb-3">
              <Label className="text-dim">Presets:</Label>
              <button type="button" onClick={() => setSettings({ ...settings, maxPages: 25, maxDepth: 3 })} className="border border-line px-2 py-1 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">Quick (25p · 3d)</button>
              <button type="button" onClick={() => setSettings({ ...settings, maxPages: 50, maxDepth: 4 })} className="border border-line px-2 py-1 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">Standard (50p · 4d)</button>
              <button type="button" onClick={() => setSettings({ ...settings, maxPages: 100, maxDepth: 6 })} className="border border-line px-2 py-1 font-mono text-[10px] text-mute hover:border-accent hover:text-accent">Deep Scan (100p · 6d)</button>
              <button type="button" onClick={() => setSettings({ ...settings, maxPages: 150, maxDepth: 8 })} className="border border-line px-2 py-1 font-mono text-[10px] text-accent border-accent/40 bg-accent/5 hover:border-accent">Maximum (150p · 8d)</button>
            </div>
            <label className="block">
              <Label>Pages (max {LIMITS.MAX_PAGES})</Label>
              {num("maxPages", 1, LIMITS.MAX_PAGES)}
            </label>
            <label className="block">
              <Label>Depth (max {LIMITS.MAX_DEPTH})</Label>
              {num("maxDepth", 0, LIMITS.MAX_DEPTH)}
            </label>
            <label className="block">
              <Label>Timeout s (max {LIMITS.MAX_TIMEOUT_SEC})</Label>
              {num("timeoutSec", LIMITS.MIN_TIMEOUT_SEC, LIMITS.MAX_TIMEOUT_SEC)}
            </label>
            <label className="block">
              <Label>JavaScript rendering</Label>
              <select value={settings.jsRendering} onChange={(e) => setSettings({ ...settings, jsRendering: e.target.value as "auto" | "off" })} className="w-full border border-line bg-bg px-2 py-2 font-mono text-sm">
                <option value="auto">Auto (detect only)</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="block">
              <Label>External domains</Label>
              <div className="border border-line bg-bg px-2 py-2 font-mono text-sm text-mute">Don&apos;t crawl</div>
            </label>
            <label className="block">
              <Label>Assets</Label>
              <select value={settings.analyzeAssets ? "analyze" : "skip"} onChange={(e) => setSettings({ ...settings, analyzeAssets: e.target.value === "analyze" })} className="w-full border border-line bg-bg px-2 py-2 font-mono text-sm">
                <option value="analyze">Analyze</option>
                <option value="skip">Skip</option>
              </select>
            </label>
            <p className="col-span-full text-xs text-mute">Crawl limits scale up to {LIMITS.MAX_PAGES} pages and depth {LIMITS.MAX_DEPTH}. External domains are never crawled — only fingerprint-recorded.</p>
          </div>
        )}

        <div className="mt-10 flex w-full items-center gap-4 text-dim" aria-hidden>
          <div className="h-px flex-1 bg-line" />
          <span className="font-mono text-[10px] tracking-[0.3em]">OR</span>
          <div className="h-px flex-1 bg-line" />
        </div>
        <Link href="/trace/demo" className="mt-6 border border-line px-8 py-3 font-mono text-xs uppercase tracking-[0.3em] transition hover:border-accent hover:text-accent">
          Explore demo
        </Link>

        {recent.length > 0 && (
          <div className="mt-10 w-full text-left">
            <Label className="mb-2">Recent in this browser</Label>
            <ul className="divide-y divide-line border border-line">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/trace/${r.id}?url=${encodeURIComponent(r.url || `https://${r.hostname}`)}`}
                    className="flex items-center justify-between px-3 py-2 text-sm transition hover:bg-panel"
                  >
                    <span className="font-mono">{r.hostname}</span>
                    <span className="font-mono text-[10px] text-mute">
                      {r.id} · {r.pages} pages
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="relative z-10 border-t border-line">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {FEATURES.map(([t, d]) => (
            <div key={t} className="bg-bg p-5 sm:p-6">
              <Label className="text-accent">{t}</Label>
              <p className="mt-2 text-sm text-mute">{d}</p>
            </div>
          ))}
        </div>
        <p className="mx-auto max-w-3xl px-5 py-6 text-center text-xs leading-relaxed text-dim">
          TRACE analyzes publicly accessible website content. Do not submit private or authenticated URLs. TRACE respects robots.txt, never crawls private networks, and limits pages, depth and request rate.
        </p>
      </section>

            <footer className="relative z-10 border-t border-line px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col sm:flex-row items-center justify-between gap-3 font-mono text-[11px]">
          <span className="text-dim uppercase tracking-wider">TRACE � The X-ray for the web</span>
          <a
            href="https://www.buymeacoffee.com/TejaPriyan"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-line bg-panel px-3 py-1 text-mute hover:border-[#FFDD00] hover:text-[#FFDD00] transition-colors"
          >
            <span>🍕</span>
            <span>Buy me a pizza</span>
          </a>
          <span className="text-right tracking-wider text-mute uppercase">
            By <span className="font-semibold text-accent">Teja Priyan</span>
          </span>
        </div>
      </footer>

      {/* Bottom corner credit */}
      <aside aria-label="Author credit" className="fixed bottom-4 right-4 z-30 font-mono text-[11px] uppercase tracking-wider">
        <div className="border border-line bg-panel/90 px-3 py-1.5 shadow-sm backdrop-blur transition hover:border-accent">
          <span className="text-mute">By </span>
          <span className="font-semibold text-accent">Teja Priyan</span>
        </div>
      </aside>
    </main>
  );
}

