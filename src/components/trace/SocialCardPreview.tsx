"use client";
import { useState } from "react";
import type { PageReport } from "@/lib/trace/types";
import { cx, Label } from "./ui";

export function SocialCardPreview({ page }: { page: PageReport }) {
  const [platform, setPlatform] = useState<"google" | "twitter" | "linkedin">("google");

  const title = page.og["og:title"] || page.twitter["twitter:title"] || page.title || "Untitled Page";
  const desc = page.og["og:description"] || page.twitter["twitter:description"] || page.description || "No description provided for this page.";
  const img = page.og["og:image"] || page.twitter["twitter:image"] || null;
  const siteUrl = page.url;

  let hostname = "";
  try {
    hostname = new URL(siteUrl).hostname;
  } catch {
    hostname = "website.com";
  }

  const titleLen = title.length;
  const descLen = desc.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Search & Social Cards</Label>
        <div className="flex gap-1">
          {(["google", "twitter", "linkedin"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={cx(
                "border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition",
                platform === p
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-mute hover:text-fg"
              )}
            >
              {p === "google" ? "Google" : p === "twitter" ? "X / Twitter" : "LinkedIn"}
            </button>
          ))}
        </div>
      </div>

      {platform === "google" && (
        <div className="rounded border border-line bg-panel p-3.5 text-left font-sans text-xs">
          <div className="flex items-center gap-1.5 text-[11px] text-mute">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-line font-mono text-[9px]">🌐</span>
            <span className="truncate">{hostname}</span>
            <span className="text-dim">›</span>
            <span className="truncate text-dim">{page.path === "/" ? "home" : page.path.replace(/^\//, "").split("/").join(" › ")}</span>
          </div>
          <div className="mt-1 line-clamp-1 text-sm font-medium text-sky-500 hover:underline">
            {title}
          </div>
          <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-mute">
            {desc}
          </div>
        </div>
      )}

      {platform === "twitter" && (
        <div className="overflow-hidden rounded-xl border border-line bg-panel text-left font-sans text-xs">
          {img ? (
            <div className="relative h-28 w-full overflow-hidden bg-panel2">
              <img src={img} alt="Card preview" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-full flex-col items-center justify-center border-b border-dashed border-line bg-panel2/60 text-center font-mono text-[10px] text-dim">
              <span>NO OG:IMAGE DETECTED</span>
              <span className="mt-0.5 text-[9px] text-mute">Card will render without image</span>
            </div>
          )}
          <div className="p-2.5">
            <div className="font-mono text-[10px] uppercase text-dim">{hostname}</div>
            <div className="mt-0.5 line-clamp-1 font-semibold text-fg">{title}</div>
            <div className="mt-0.5 line-clamp-2 text-[11px] text-mute">{desc}</div>
          </div>
        </div>
      )}

      {platform === "linkedin" && (
        <div className="overflow-hidden rounded border border-line bg-panel text-left font-sans text-xs shadow-sm">
          {img ? (
            <div className="relative h-28 w-full overflow-hidden bg-panel2">
              <img src={img} alt="LinkedIn preview" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-full items-center justify-center border-b border-line bg-panel2 font-mono text-[10px] text-dim">
              NO OG:IMAGE
            </div>
          )}
          <div className="border-t border-line bg-bg/80 p-2.5">
            <div className="line-clamp-1 font-semibold text-fg">{title}</div>
            <div className="mt-0.5 font-mono text-[10px] text-dim">{hostname}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
        <div className="border border-line bg-panel2/50 px-2 py-1">
          <span className="text-mute">Title: </span>
          <span className={cx(titleLen > 60 ? "text-warn" : titleLen < 10 ? "text-bad" : "text-ok")}>
            {titleLen} chars
          </span>
          <span className="text-dim"> (50-60 ideal)</span>
        </div>
        <div className="border border-line bg-panel2/50 px-2 py-1">
          <span className="text-mute">Desc: </span>
          <span className={cx(descLen > 160 ? "text-warn" : descLen < 50 ? "text-bad" : "text-ok")}>
            {descLen} chars
          </span>
          <span className="text-dim"> (120-160 ideal)</span>
        </div>
      </div>
    </div>
  );
}
