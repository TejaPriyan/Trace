"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTrace } from "./TraceContext";
import { StructuralPreview } from "./StructuralPreview";
import { SocialCardPreview } from "./SocialCardPreview";
import { Badge, Btn, ExtLink, Label, cx, safeHref } from "./ui";
import type { PageReport } from "@/lib/trace/types";

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-4">
      <Label className="mb-3 text-accent">{title}</Label>
      {children}
    </section>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="shrink-0 text-xs text-mute">{k}</span>
      <span className="min-w-0 break-words text-right font-mono text-xs">{v ?? <span className="text-dim">Not detected</span>}</span>
    </div>
  );
}

export function PageXray() {
  const { xrayId, openXray, pageById } = useTrace();
  const page = xrayId ? pageById.get(xrayId) : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!xrayId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openXray(null);
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [xrayId, openXray]);
  return (
    <AnimatePresence>
      {page && (
        <>
          <motion.div key="bd" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="no-print fixed inset-0 z-40 bg-black/50" onClick={() => openXray(null)} aria-hidden />
          <motion.aside key="panel" role="dialog" aria-modal="true" aria-label={`Page X-ray: ${page.path}`} initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.22, ease: "easeOut" }} className="no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-5xl flex-col border-l border-line bg-bg shadow-2xl">
            <XrayBody page={page} closeRef={closeRef} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function XrayBody({ page, closeRef }: { page: PageReport; closeRef: React.RefObject<HTMLButtonElement | null> }) {
  const { report, pageById, openXray, goto, setSelectedNode } = useTrace();
  const [previewTab, setPreviewTab] = useState<"wireframe" | "cards">("wireframe");
  const sec = report.sections.find((s) => s.id === page.section);
  const issues = useMemo(() => [...report.seo.checks, ...report.a11y.checks, ...report.perf.checks].filter((c) => c.status !== "pass" && c.status !== "info" && c.affected.includes(page.id)), [report, page.id]);
  const repeated = report.content.repeated.filter((r) => r.pageIds.includes(page.id));
  const h = page.headings;
  const h2 = h.filter((x) => x.level === 2).length;
  const h3 = h.filter((x) => x.level === 3).length;
  const reciprocal = page.outgoing.filter((id) => page.incoming.includes(id));
  const related = [...new Set([...reciprocal, ...page.outgoing])].slice(0, 6);
  const broken = page.broken;
  const jump = (id: string) => openXray(id);
  const List = ({ ids }: { ids: string[] }) =>
    ids.length === 0 ? (
      <div className="text-xs text-dim">None</div>
    ) : (
      <ul className="space-y-0.5">
        {ids.slice(0, 14).map((id) => (
          <li key={id}>
            <button onClick={() => jump(id)} className="block max-w-full truncate font-mono text-xs text-mute hover:text-accent">
              {pageById.get(id)?.path}
            </button>
          </li>
        ))}
        {ids.length > 14 && <li className="text-[11px] text-dim">+{ids.length - 14} more</li>}
      </ul>
    );
  return (
    <>
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <Label>Page X-ray</Label>
          <h2 className="mt-1 break-all font-mono text-lg">{page.path}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone="accent">{page.type}</Badge>
            <Badge title={page.typeBasis}>Inferred: {page.typeBasis}</Badge>
            {sec && <Badge>{sec.label}</Badge>}
            {broken && <Badge tone="bad">{page.status ?? "Failed"}</Badge>}
            {page.orphanLike && <Badge tone="warn">Orphan-like</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Btn
            onClick={() => {
              setSelectedNode(page.id);
              openXray(null);
              goto("map");
            }}
          >
            Show on map
          </Btn>
          <button ref={closeRef} onClick={() => openXray(null)} aria-label="Close X-ray" className="border border-line px-2.5 font-mono text-mute hover:border-accent hover:text-accent">
            ✕
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[320px_1fr]">
        <div className="border-b border-line p-5 space-y-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <Label>Visual preview</Label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPreviewTab("wireframe")}
                className={cx("border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition", previewTab === "wireframe" ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-fg")}
              >
                Wireframe
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab("cards")}
                className={cx("border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition", previewTab === "cards" ? "border-accent bg-accent/15 text-accent" : "border-line text-mute hover:text-fg")}
              >
                SERP & Social
              </button>
            </div>
          </div>

          {previewTab === "wireframe" ? (
            <div>
              <StructuralPreview page={page} />
              <p className="mt-2 text-[11px] leading-snug text-dim">Structural preview generated from extracted headings, links, images and forms. Screenshots are not captured.</p>
            </div>
          ) : (
            <SocialCardPreview page={page} />
          )}

          {issues.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <Label className="mb-2">Signals on this page</Label>
              <ul className="space-y-2">
                {issues.map((c) => (
                  <li key={c.id} className="text-xs">
                    <span className={cx("font-mono uppercase", c.status === "fail" ? "text-bad" : "text-warn")}>{c.label}</span>
                    <div className="text-mute">{c.evidence.find((e) => e.startsWith(page.path))?.replace(page.path, "").replace(/^ — /, "") || c.detail}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>


        <div className="px-5 pb-8">
          <Sec title="Basic">
            <KV k="URL" v={<ExtLink href={page.url}>{page.url}</ExtLink>} />
            <KV k="Title" v={page.title} />
            <KV k="Description" v={page.description} />
            <KV k="Canonical" v={page.canonical} />
            <KV k="Language" v={page.lang} />
            <KV k="HTTP status" v={page.status ?? page.error ?? "Failed"} />
            <KV k="Content type" v={page.contentType} />
            <KV k="Depth" v={page.depth} />
            <KV k="Found via" v={page.parentUrl ? new URL(page.parentUrl).pathname : "Start URL"} />
            <KV k="Response / size" v={page.status ? `${page.responseMs} ms · ${(page.htmlBytes / 1024).toFixed(0)} KB` : null} />
          </Sec>
          <Sec title="Structure">
            <div className="grid grid-cols-3 gap-px bg-line sm:grid-cols-4">
              {[
                ["H1", h.filter((x) => x.level === 1).length],
                ["H2", h2],
                ["H3", h3],
                ["Images", page.images.length],
                ["Links", page.links.length],
                ["Forms", page.forms.length],
                ["Buttons", page.buttons.length],
                ["Sections", page.landmarks.main + page.landmarks.aside + page.landmarks.nav + page.landmarks.header + page.landmarks.footer],
              ].map(([l, v]) => (
                <div key={l as string} className="bg-bg p-2.5">
                  <Label>{l}</Label>
                  <div className="mt-0.5 font-mono text-lg">{v}</div>
                </div>
              ))}
            </div>
            {page.forms.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-mute">
                {page.forms.map((f, i) => (
                  <li key={i} className="font-mono">
                    FORM {f.method.toUpperCase()} {safePath(f.action)} · {f.fields} fields ({f.labeled} labeled){f.hasPassword ? " · password" : ""}
                  </li>
                ))}
              </ul>
            )}
          </Sec>
          <Sec title="Links">
            <div className="grid gap-4 sm:grid-cols-2">
              <KV k="Internal links" v={page.internalLinkCount} />
              <KV k="External links" v={page.externalLinkCount} />
              <KV k="Incoming (pages)" v={page.incoming.length} />
              <KV k="Outgoing (pages)" v={page.outgoing.length} />
            </div>
          </Sec>
          <Sec title="Metadata">
            <KV k="Open Graph" v={Object.keys(page.og).length ? Object.entries(page.og).slice(0, 5).map(([k, v]) => `${k}: ${v.slice(0, 50)}`).join(" · ") : null} />
            <KV k="Twitter" v={Object.keys(page.twitter).length ? Object.entries(page.twitter).slice(0, 4).map(([k, v]) => `${k}: ${v.slice(0, 40)}`).join(" · ") : null} />
            <KV k="Robots directives" v={page.robotsMeta} />
            <KV k="Structured data" v={page.jsonLd.length ? page.jsonLd.join(", ") : null} />
            <KV k="Technologies" v={page.techNames.length ? page.techNames.join(", ") : null} />
          </Sec>
          <Sec title="Content">
            <KV k="Word count" v={page.wordCount} />
            <div className="mt-2">
              <Label className="mb-1.5">Heading hierarchy</Label>
              {h.length === 0 ? (
                <div className="text-xs text-dim">No headings detected</div>
              ) : (
                <ul className="space-y-0.5 font-mono text-xs">
                  {h.slice(0, 24).map((x, i) => (
                    <li key={i} style={{ paddingLeft: (x.level - 1) * 14 }} className={cx(x.level === 1 ? "text-fg" : "text-mute")}>
                      <span className="mr-2 text-dim">H{x.level}</span>
                      {x.text || <em className="text-bad">empty</em>}
                    </li>
                  ))}
                  {h.length > 24 && <li className="text-dim">+{h.length - 24} more</li>}
                </ul>
              )}
            </div>
            <div className="mt-3">
              <Label className="mb-1.5">Detected content blocks</Label>
              {page.blocks.length === 0 ? (
                <div className="text-xs text-dim">No readable text blocks in server HTML</div>
              ) : (
                <ul className="space-y-1.5 text-xs text-mute">
                  {page.blocks.slice(0, 4).map((b, i) => (
                    <li key={i} className="border-l border-line pl-2">
                      {b.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="mt-3">
              <Label className="mb-1.5">Repeated content</Label>
              {repeated.length === 0 ? <div className="text-xs text-dim">None detected</div> : <ul className="space-y-1 text-xs text-mute">{repeated.slice(0, 3).map((r, i) => <li key={i}>“{r.text.slice(0, 120)}” — on {r.count} pages</li>)}</ul>}
            </div>
            {page.ctas.length > 0 && <KV k="Calls to action" v={page.ctas.slice(0, 5).join(" · ")} />}
          </Sec>
        </div>
      </div>

      <div className="grid gap-5 border-t border-line bg-panel px-5 py-4 sm:grid-cols-3">
        <div>
          <Label className="mb-2">← {page.incoming.length} incoming links</Label>
          <List ids={page.incoming} />
        </div>
        <div>
          <Label className="mb-2">→ {page.outgoing.length} outgoing links</Label>
          <List ids={page.outgoing} />
        </div>
        <div>
          <Label className="mb-2">Related</Label>
          <List ids={related} />
          {reciprocal.length > 0 && <div className="mt-1 text-[11px] text-dim">{reciprocal.length} linked in both directions</div>}
        </div>
      </div>
    </>
  );
}

function safePath(u: string) {
  try {
    return safeHref(u) ? new URL(u).pathname : u;
  } catch {
    return u;
  }
}
