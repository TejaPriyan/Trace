"use client";
import { useState } from "react";
import type { TraceReport } from "@/lib/trace/types";
import { Badge, Btn, Label, cx } from "./ui";

interface Recommendation {
  id: string;
  category: "security" | "performance" | "seo" | "architecture";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  action: string;
  affectedCount?: number;
}

export function generateRecommendations(report: TraceReport): Recommendation[] {
  const recs: Recommendation[] = [];

  // 1. Security Analysis
  const firstHeaders = report.pages[0]?.headers ?? {};
  const hasHsts = Object.keys(firstHeaders).some((k) => k.toLowerCase() === "strict-transport-security");
  const hasCsp = Object.keys(firstHeaders).some((k) => k.toLowerCase() === "content-security-policy");
  const hasXfo = Object.keys(firstHeaders).some((k) => k.toLowerCase() === "x-frame-options");
  const hasXcto = Object.keys(firstHeaders).some((k) => k.toLowerCase() === "x-content-type-options");

  if (!hasHsts && report.url.startsWith("https://")) {
    recs.push({
      id: "sec-hsts",
      category: "security",
      severity: "high",
      title: "Add Strict-Transport-Security (HSTS)",
      description: "Browsers may downgrade initial connections to unencrypted HTTP if HSTS is missing.",
      action: "Configure HSTS header: Strict-Transport-Security: max-age=63072000; includeSubDomains; preload",
    });
  }

  if (!hasCsp) {
    recs.push({
      id: "sec-csp",
      category: "security",
      severity: "high",
      title: "Deploy a Content-Security-Policy (CSP)",
      description: "No Content-Security-Policy was detected. This leaves the site open to cross-site scripting (XSS) and data injection.",
      action: "Add a CSP header whitelisting trusted origins and scripts (use the Security Fix Generator below).",
    });
  }

  if (!hasXfo) {
    recs.push({
      id: "sec-xfo",
      category: "security",
      severity: "medium",
      title: "Prevent Clickjacking with X-Frame-Options",
      description: "Any malicious site can embed your pages in an iframe and trick users into clicking hidden buttons.",
      action: "Set X-Frame-Options: SAMEORIGIN or use CSP frame-ancestors 'self'.",
    });
  }

  if (!hasXcto) {
    recs.push({
      id: "sec-xcto",
      category: "security",
      severity: "medium",
      title: "Enable MIME Sniffing Protection (X-Content-Type-Options)",
      description: "Without nosniff, browsers may attempt to guess file types and execute user-uploaded files as HTML or JavaScript.",
      action: "Set X-Content-Type-Options: nosniff on all static and dynamic responses.",
    });
  }

  // 2. SEO & Content Analysis
  const missingDesc = report.pages.filter((p) => p.status === 200 && !p.description);
  if (missingDesc.length > 0) {
    recs.push({
      id: "seo-desc",
      category: "seo",
      severity: missingDesc.length > 3 ? "high" : "medium",
      title: "Add Meta Descriptions to Crawled Pages",
      description: `${missingDesc.length} pages are missing a <meta name="description"> tag, which search engines rely on for rich SERP snippets.`,
      action: "Add unique 120-160 character descriptions summarizing each page's specific content.",
      affectedCount: missingDesc.length,
    });
  }

  const missingH1 = report.pages.filter((p) => p.status === 200 && !p.headings.some((h) => h.level === 1 && h.text.trim()));
  if (missingH1.length > 0) {
    recs.push({
      id: "seo-h1",
      category: "seo",
      severity: "medium",
      title: "Ensure Every Page Has Exactly One H1 Tag",
      description: `${missingH1.length} pages do not contain a primary <h1> heading, harming accessibility and topical search relevance.`,
      action: "Add a descriptive <h1> element at the top of the main content area for each page.",
      affectedCount: missingH1.length,
    });
  }

  // 3. Performance & Core Web Vitals Analysis
  const unconstrainedImages = report.pages.reduce((acc, p) => acc + p.images.filter((img) => !img.hasDimensions).length, 0);
  if (unconstrainedImages > 0) {
    recs.push({
      id: "perf-cls",
      category: "performance",
      severity: unconstrainedImages > 5 ? "high" : "medium",
      title: "Mitigate Cumulative Layout Shift (CLS)",
      description: `Detected ${unconstrainedImages} image element(s) missing explicit width and height attributes. This causes unexpected layout jumping as images load.`,
      action: "Add explicit width/height attributes or CSS aspect-ratio properties to all <img> and <picture> elements.",
      affectedCount: unconstrainedImages,
    });
  }

  const renderBlockingScripts = report.pages.reduce(
    (acc, p) => acc + p.scripts.filter((s) => s.inHead && !s.defer && !s.async).length,
    0
  );
  if (renderBlockingScripts > 0) {
    recs.push({
      id: "perf-scripts",
      category: "performance",
      severity: "high",
      title: "Eliminate Render-Blocking Scripts in <head>",
      description: `Found ${renderBlockingScripts} synchronous <script> tag(s) inside the <head>. These pause HTML parsing until downloaded, inflating First Contentful Paint (FCP) and INP.`,
      action: "Add defer or async attributes to external head scripts, or relocate non-critical scripts to the bottom of the <body>.",
      affectedCount: renderBlockingScripts,
    });
  }

  // 4. Architecture & Navigation Analysis
  if (report.stats.brokenPages > 0) {
    recs.push({
      id: "arch-broken",
      category: "architecture",
      severity: "high",
      title: "Fix Broken Internal Links (4xx/5xx Responses)",
      description: `The crawler encountered ${report.stats.brokenPages} broken or error response(s) within the site's own link hierarchy.`,
      action: "Update or redirect broken internal URLs in the Pages view to preserve link equity and prevent dead-ends.",
      affectedCount: report.stats.brokenPages,
    });
  }

  if (report.stats.maxDepth > 4) {
    recs.push({
      id: "arch-depth",
      category: "architecture",
      severity: "low",
      title: "Flatten Navigation Depth",
      description: `Some pages are buried ${report.stats.maxDepth} clicks away from the homepage. Search crawlers and users may overlook deeply nested content.`,
      action: "Add contextual internal links or breadcrumb navigation to ensure key pages are reachable in 3 clicks or fewer.",
    });
  }

  return recs;
}

export function SiteRecommendations({ report }: { report: TraceReport }) {
  const [filter, setFilter] = useState<string>("all");
  const recs = generateRecommendations(report);

  const filtered = filter === "all" ? recs : recs.filter((r) => r.category === filter);

  const counts = {
    all: recs.length,
    high: recs.filter((r) => r.severity === "high").length,
    medium: recs.filter((r) => r.severity === "medium").length,
    low: recs.filter((r) => r.severity === "low").length,
  };

  return (
    <div className="border border-line bg-panel p-5 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Label className="text-accent">Intelligent Optimization Suggestions</Label>
            <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-mute">
              {recs.length} actionable items
            </span>
          </div>
          <p className="mt-1 text-xs text-mute">
            Custom recommendations formulated from technical SEO signals, Core Web Vitals heuristics, and security audits for <span className="font-mono text-fg">{report.hostname}</span>.
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {counts.high > 0 && (
            <span className="border border-bad/30 bg-bad/10 px-2 py-0.5 font-mono text-[10px] text-bad">
              {counts.high} High Priority
            </span>
          )}
          {counts.medium > 0 && (
            <span className="border border-warn/30 bg-warn/10 px-2 py-0.5 font-mono text-[10px] text-warn">
              {counts.medium} Medium
            </span>
          )}
          {counts.high === 0 && counts.medium === 0 && (
            <span className="border border-ok/30 bg-ok/10 px-2 py-0.5 font-mono text-[10px] text-ok">
              ✓ Good Health
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-line pb-3">
        {(["all", "security", "performance", "seo", "architecture"] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={cx(
              "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
              filter === cat
                ? "border-accent bg-accent/15 text-accent"
                : "border-line text-mute hover:text-fg"
            )}
          >
            {cat} {cat === "all" ? `(${recs.length})` : `(${recs.filter((r) => r.category === cat).length})`}
          </button>
        ))}
      </div>

      {/* Recommendations List */}
      {filtered.length === 0 ? (
        <div className="py-6 text-center font-mono text-xs text-mute">
          No suggestions found for this category. Excellent job!
        </div>
      ) : (
        <ul className="divide-y divide-line border border-line bg-bg">
          {filtered.map((item) => (
            <li key={item.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cx(
                      "font-mono text-[10px] uppercase font-semibold px-1.5 py-0.5 border",
                      item.severity === "high"
                        ? "border-bad/40 bg-bad/10 text-bad"
                        : item.severity === "medium"
                        ? "border-warn/40 bg-warn/10 text-warn"
                        : "border-line text-mute"
                    )}
                  >
                    {item.severity}
                  </span>
                  <span className="font-mono text-[10px] text-dim uppercase tracking-wider">
                    {item.category}
                  </span>
                  <h4 className="text-sm font-medium text-fg">{item.title}</h4>
                </div>
                {item.affectedCount && (
                  <span className="font-mono text-[10px] text-mute">
                    {item.affectedCount} affected
                  </span>
                )}
              </div>

              <p className="text-xs text-mute leading-relaxed">{item.description}</p>

              <div className="rounded border border-line/80 bg-panel px-3 py-2 font-mono text-[11px] text-fg/90">
                <span className="text-accent font-semibold">Suggested Action: </span>
                <span>{item.action}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
