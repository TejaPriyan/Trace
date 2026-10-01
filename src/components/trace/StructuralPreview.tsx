"use client";
import type { PageReport } from "@/lib/trace/types";
import { cx } from "./ui";

const W = [92, 78, 85, 64, 90, 70];

/** Wireframe generated from the page's extracted structure. This is not a screenshot. */
export function StructuralPreview({ page, compact = false }: { page: PageReport; compact?: boolean }) {
  const nav = page.links.filter((l) => l.area === "nav" || l.area === "header").slice(0, compact ? 4 : 7);
  const h1 = page.headings.find((h) => h.level === 1)?.text;
  const h2s = page.headings.filter((h) => h.level === 2 && h.text).slice(0, compact ? 2 : 5);
  const imgs = Math.min(page.images.length, compact ? 3 : 6);
  const form = page.forms[0];
  const textLines = Math.max(1, Math.min(compact ? 2 : 3, Math.round(page.wordCount / 250)));
  const broken = page.status === null || page.status >= 400;
  return (
    <div aria-hidden className={cx("overflow-hidden border border-line bg-bg text-fg", compact ? "text-[7px]" : "text-[9px]")}>
      <div className="flex items-center gap-1 border-b border-line bg-panel2 px-2 py-1">
        <span className="h-1.5 w-1.5 rounded-full bg-dim" />
        <span className="h-1.5 w-1.5 rounded-full bg-dim" />
        <span className="h-1.5 w-1.5 rounded-full bg-dim" />
        <span className="ml-2 truncate font-mono text-mute">{page.path}</span>
      </div>
      {broken ? (
        <div className={cx("flex items-center justify-center font-mono text-bad", compact ? "h-24" : "h-56")}>{page.status ?? "FAILED"}</div>
      ) : (
        <div className={cx("space-y-2 p-2", !compact && "space-y-3 p-3")}>
          <div className="flex items-center gap-1.5 border-b border-line pb-1.5">
            <span className="h-2 w-5 bg-fg/70" />
            <span className="flex-1" />
            {nav.map((n, i) => (
              <span key={i} className="h-1.5 bg-mute/60" style={{ width: Math.max(10, Math.min(30, (n.text.length || 4) * 2.2)) }} />
            ))}
          </div>
          {h1 ? <div className={cx("line-clamp-2 font-semibold leading-tight", compact ? "text-[9px]" : "text-sm")}>{h1}</div> : <div className="h-2 w-1/2 border border-dashed border-bad/60" title="No H1" />}
          {Array.from({ length: textLines }).map((_, i) => (
            <div key={i} className="h-1 bg-mute/40" style={{ width: `${W[i % W.length]}%` }} />
          ))}
          {imgs > 0 && (
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(imgs, 3)}, 1fr)` }}>
              {Array.from({ length: imgs }).map((_, i) => (
                <div key={i} className={cx("border border-line bg-panel2", compact ? "h-5" : "h-10", page.images[i]?.alt === null && "border-dashed border-warn/70")} />
              ))}
            </div>
          )}
          {h2s.map((h, i) => (
            <div key={i} className="space-y-1">
              <div className="truncate font-medium text-fg/90">{h.text}</div>
              <div className="h-1 bg-mute/30" style={{ width: `${W[(i + 2) % W.length]}%` }} />
              {!compact && <div className="h-1 bg-mute/30" style={{ width: `${W[(i + 4) % W.length]}%` }} />}
            </div>
          ))}
          {form && (
            <div className="space-y-1 border border-accent/50 p-1.5">
              {Array.from({ length: Math.min(form.fields, 3) }).map((_, i) => (
                <div key={i} className="h-2 border border-line" />
              ))}
              <div className="h-2 w-1/3 bg-accent/70" />
            </div>
          )}
          <div className="flex gap-2 border-t border-line pt-1.5">
            {page.links.filter((l) => l.area === "footer").slice(0, 4).map((_, i) => (
              <span key={i} className="h-1 w-6 bg-dim/60" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
