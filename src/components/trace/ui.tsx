"use client";
import type { ReactNode } from "react";
import type { Confidence } from "@/lib/trace/types";

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("font-mono text-[10px] uppercase tracking-[0.18em] text-mute", className)}>{children}</div>;
}

export function Stat({ label, value, sub, onClick }: { label: string; value: ReactNode; sub?: string; onClick?: () => void }) {
  const inner = (
    <>
      <Label>{label}</Label>
      <div className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-mute">{sub}</div>}
    </>
  );
  return onClick ? (
    <button onClick={onClick} className="border border-line bg-panel p-4 text-left transition hover:border-accent focus-visible:border-accent">
      {inner}
    </button>
  ) : (
    <div className="border border-line bg-panel p-4">{inner}</div>
  );
}

type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";
const TONES: Record<Tone, string> = {
  neutral: "border-line text-mute",
  accent: "border-accent/50 text-accent",
  ok: "border-ok/50 text-ok",
  warn: "border-warn/50 text-warn",
  bad: "border-bad/50 text-bad",
};
export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider", TONES[tone])}>
      {children}
    </span>
  );
}
export const Inferred = () => <Badge title="Derived heuristically from observed signals; not stated by the site">Inferred</Badge>;
export const ConfBadge = ({ c }: { c: Confidence }) => <Badge tone={c === "High" ? "ok" : c === "Medium" ? "warn" : "neutral"}>{c} confidence</Badge>;

export function SectionTitle({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker && <Label className="mb-1">{kicker}</Label>}
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      </div>
      {right}
    </div>
  );
}

export function Empty({ title, text }: { title?: string; text: string }) {
  return (
    <div className="border border-dashed border-line p-8 text-center">
      {title && <div className="mb-1 font-mono text-xs uppercase tracking-widest text-mute">{title}</div>}
      <div className="text-sm text-mute">{text}</div>
    </div>
  );
}

export function Btn({ children, onClick, variant = "ghost", className, disabled, type = "button", title, href }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost"; className?: string; disabled?: boolean; type?: "button" | "submit"; title?: string; href?: string }) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] transition disabled:opacity-40",
    variant === "primary" ? "bg-fg text-bg hover:bg-accent hover:text-[var(--accent-ink)]" : "border border-line text-fg hover:border-accent hover:text-accent",
    className,
  );
  if (href)
    return (
      <a href={href} className={cls} title={title}>
        {children}
      </a>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} title={title}>
      {children}
    </button>
  );
}

export function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "warm" | "ok" | "bad" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = { accent: "bg-accent", warm: "bg-warm", ok: "bg-ok", bad: "bg-bad" }[tone];
  return (
    <div className="h-1.5 w-full bg-panel2" role="presentation">
      <div className={cx("h-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function sectionColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 58% 60%)`;
}

export const safeHref = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : undefined);

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const h = safeHref(href);
  if (!h) return <span className={className}>{children}</span>;
  return (
    <a href={h} target="_blank" rel="noopener noreferrer nofollow" className={cx("underline decoration-line underline-offset-2 hover:text-accent", className)}>
      {children}
    </a>
  );
}

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}
