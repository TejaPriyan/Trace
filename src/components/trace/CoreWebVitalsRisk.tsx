"use client";
import type { TraceReport } from "@/lib/trace/types";
import { Badge, Label, cx } from "./ui";

export function CoreWebVitalsRisk({ report }: { report: TraceReport }) {
  const pages = report.pages.filter((p) => p.status !== null && p.status < 400);
  
  // CLS Risk Calculation: images without width/height
  const totalImgs = pages.reduce((sum, p) => sum + p.images.length, 0);
  const imgsMissingDims = pages.reduce(
    (sum, p) => sum + p.images.filter((i) => !i.hasDimensions).length,
    0
  );
  const clsMissingRatio = totalImgs > 0 ? imgsMissingDims / totalImgs : 0;
  const clsRisk = clsMissingRatio > 0.4 ? "high" : clsMissingRatio > 0.15 ? "moderate" : "low";

  // LCP Risk Calculation: TTFB / response times + uncompressed or heavy HTML
  const slowPages = pages.filter((p) => p.responseMs > 600).length;
  const heavyPages = pages.filter((p) => p.htmlBytes > 200 * 1024).length;
  const lcpScore = (slowPages / Math.max(1, pages.length)) * 0.6 + (heavyPages / Math.max(1, pages.length)) * 0.4;
  const lcpRisk = lcpScore > 0.35 ? "high" : lcpScore > 0.1 ? "moderate" : "low";

  // INP / TBT Risk Calculation: render-blocking scripts in <head>
  const totalHeadScripts = pages.reduce(
    (sum, p) => sum + p.scripts.filter((s) => s.inHead && !s.async && !s.defer && !s.module).length,
    0
  );
  const avgBlockingScripts = pages.length > 0 ? totalHeadScripts / pages.length : 0;
  const inpRisk = avgBlockingScripts > 2 ? "high" : avgBlockingScripts > 0.5 ? "moderate" : "low";

  const riskTone = (r: "low" | "moderate" | "high") =>
    r === "low" ? "text-ok" : r === "moderate" ? "text-warn" : "text-bad";

  const riskBadge = (r: "low" | "moderate" | "high") =>
    r === "low" ? (
      <Badge tone="ok">Low risk</Badge>
    ) : r === "moderate" ? (
      <Badge tone="warn">Moderate risk</Badge>
    ) : (
      <Badge tone="bad">Attention needed</Badge>
    );

  return (
    <div className="border border-line bg-panel p-5 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <div>
          <Label className="text-accent">Estimated Core Web Vitals Risk</Label>
          <p className="mt-1 text-xs text-mute">
            Heuristic assessment inferred from DOM metrics, render-blocking scripts, unconstrained images, and response latencies.
          </p>
        </div>
        <span className="font-mono text-[10px] text-dim">Based on {pages.length} pages</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* LCP */}
        <div className="border border-line bg-bg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-fg">LCP</span>
            {riskBadge(lcpRisk)}
          </div>
          <div className="font-mono text-xs text-mute">Largest Contentful Paint</div>
          <div className="pt-2 text-xs leading-relaxed text-dim border-t border-line">
            <div className="flex justify-between py-0.5">
              <span>Pages &gt;600ms TTFB:</span>
              <span className={cx("font-mono font-medium", slowPages > 0 ? "text-warn" : "text-ok")}>{slowPages}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Heavy HTML (&gt;200KB):</span>
              <span className="font-mono font-medium">{heavyPages}</span>
            </div>
          </div>
          <p className="text-[11px] text-mute pt-1">
            {lcpRisk === "low"
              ? "Good server latency & document payloads detected."
              : "Preload hero assets and optimize server response time to protect LCP."}
          </p>
        </div>

        {/* CLS */}
        <div className="border border-line bg-bg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-fg">CLS</span>
            {riskBadge(clsRisk)}
          </div>
          <div className="font-mono text-xs text-mute">Cumulative Layout Shift</div>
          <div className="pt-2 text-xs leading-relaxed text-dim border-t border-line">
            <div className="flex justify-between py-0.5">
              <span>Total images:</span>
              <span className="font-mono font-medium">{totalImgs}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Missing width/height:</span>
              <span className={cx("font-mono font-medium", imgsMissingDims > 0 ? "text-warn" : "text-ok")}>
                {imgsMissingDims} ({Math.round(clsMissingRatio * 100)}%)
              </span>
            </div>
          </div>
          <p className="text-[11px] text-mute pt-1">
            {clsRisk === "low"
              ? "Images declare explicit dimensions, preventing layout jumps."
              : "Add explicit width/height or aspect-ratio CSS to avoid layout shift."}
          </p>
        </div>

        {/* INP / TBT */}
        <div className="border border-line bg-bg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-sm font-semibold text-fg">INP / TBT</span>
            {riskBadge(inpRisk)}
          </div>
          <div className="font-mono text-xs text-mute">Interaction to Next Paint</div>
          <div className="pt-2 text-xs leading-relaxed text-dim border-t border-line">
            <div className="flex justify-between py-0.5">
              <span>Blocking scripts in &lt;head&gt;:</span>
              <span className={cx("font-mono font-medium", totalHeadScripts > 0 ? "text-warn" : "text-ok")}>
                {totalHeadScripts}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span>Avg per page:</span>
              <span className="font-mono font-medium">{avgBlockingScripts.toFixed(1)}</span>
            </div>
          </div>
          <p className="text-[11px] text-mute pt-1">
            {inpRisk === "low"
              ? "Minimal render-blocking scripts observed before main body."
              : "Add `defer` or `async` to non-critical head scripts to unblock main thread."}
          </p>
        </div>
      </div>
    </div>
  );
}
