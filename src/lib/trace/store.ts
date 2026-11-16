import "server-only";
import crypto from "node:crypto";
import { and, desc, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import type { CrawlLogEntry, CrawlSettings, ErrorCode, Phase, Progress, TraceReport } from "./types";
import { LIMITS } from "./limits";
import { crawlSite } from "./crawler";
import { buildReport } from "./report";
import { TraceError } from "./security";
import { urlKey } from "./graph";
import { releaseJob } from "./rate-limit";
import { buildDemoReport } from "./demo";

const MAX_MEMORY_REPORTS = 200;
const MAX_MEMORY_WEBSITES = 500;

export type TraceEvent =
  | { type: "progress"; progress: Progress }
  | { type: "complete"; report: TraceReport }
  | { type: "error"; error: { code: ErrorCode; message: string } };

interface JobRecord {
  progress: Progress;
  listeners: Set<(event: TraceEvent) => void>;
}

const g = globalThis as typeof globalThis & {
  __traceJobs?: Map<string, JobRecord>;
  __traceMemoryReports?: Map<string, TraceReport>;
  __traceMemoryReportSavedAt?: Map<string, number>;
  __traceMemoryWebsites?: Map<string, { id: string; url: string; urlKey: string; createdAt: Date }>;
};
const jobs = (g.__traceJobs ??= new Map<string, JobRecord>());
const memoryReports = (g.__traceMemoryReports ??= new Map<string, TraceReport>());
const memoryReportSavedAt = (g.__traceMemoryReportSavedAt ??= new Map<string, number>());
const memoryWebsites = (g.__traceMemoryWebsites ??= new Map<string, { id: string; url: string; urlKey: string; createdAt: Date }>());

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newTraceId(): string {
  const b = crypto.randomBytes(8);
  let s = "";
  for (const x of b) s += ALPHABET[x % 32];
  return "TRC-" + s;
}
export const isTraceId = (id: string) => id === "demo" || /^TRC-[0-9A-Z]{8}$/.test(id);

export function evictMemoryCache(now = Date.now()) {
  for (const [id, r] of memoryReports) {
    const parsed = Date.parse(r.createdAt);
    const ts = Number.isFinite(parsed) ? parsed : (memoryReportSavedAt.get(id) ?? now);
    if (now - ts >= LIMITS.RETENTION_MS) {
      memoryReports.delete(id);
      memoryReportSavedAt.delete(id);
    }
  }
  while (memoryReports.size > MAX_MEMORY_REPORTS) {
    const oldestId = memoryReports.keys().next().value;
    if (oldestId === undefined) break;
    memoryReports.delete(oldestId);
    memoryReportSavedAt.delete(oldestId);
  }
  for (const [key, entry] of memoryWebsites) {
    if (now - entry.createdAt.getTime() >= LIMITS.CACHE_TTL_MS || !memoryReports.has(entry.id)) {
      memoryWebsites.delete(key);
    }
  }
  while (memoryWebsites.size > MAX_MEMORY_WEBSITES) {
    const oldestKey = memoryWebsites.keys().next().value;
    if (oldestKey === undefined) break;
    memoryWebsites.delete(oldestKey);
  }
}

export async function findExisting(url: string): Promise<{ id: string; createdAt: string } | null> {
  const key = urlKey(url);
  const now = Date.now();
  evictMemoryCache(now);
  const fromMemory = () => {
    const existing = memoryWebsites.get(key);
    if (existing && now - existing.createdAt.getTime() < LIMITS.CACHE_TTL_MS && memoryReports.has(existing.id)) {
      return { id: existing.id, createdAt: existing.createdAt.toISOString() };
    }
    return null;
  };
  if (!db) return fromMemory();
  try {
    const since = new Date(now - LIMITS.CACHE_TTL_MS);
    const rows = await db
      .select({ id: t.websites.traceId, createdAt: t.websites.createdAt })
      .from(t.websites)
      .where(and(eq(t.websites.urlKey, key), eq(t.websites.status, "complete"), gt(t.websites.createdAt, since)))
      .orderBy(desc(t.websites.createdAt))
      .limit(1);
    return rows[0] ? { id: rows[0].id, createdAt: rows[0].createdAt.toISOString() } : null;
  } catch {
    return fromMemory();
  }
}

export async function cleanupOld(now = Date.now()) {
  evictMemoryCache(now);
  if (!db) return;
  try {
    await db.delete(t.websites).where(lt(t.websites.createdAt, new Date(now - LIMITS.RETENTION_MS)));
  } catch {}
}

async function initTraceJob(id: string, url: string, settings: CrawlSettings): Promise<JobRecord> {
  const u = new URL(url);
  const key = urlKey(url);
  if (db) {
    try {
      await db
        .insert(t.websites)
        .values({
          traceId: id,
          url,
          urlKey: key,
          hostname: u.hostname.replace(/^www\./, ""),
          status: "running",
          settings: settings as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({ target: t.websites.traceId });
    } catch (e) {
      console.warn("[trace] DB insert failed, using memory store", e);
    }
  }
  const progress: Progress = {
    phase: "connecting",
    discovered: 0,
    analyzed: 0,
    queued: 0,
    depth: 0,
    externalDomains: 0,
    maxPages: settings.maxPages,
    log: [],
    startedAt: Date.now(),
    message: "Validating destination",
    robots: null,
    error: null,
  };
  const record: JobRecord = { progress, listeners: new Set() };
  jobs.set(id, record);
  return record;
}

async function runTraceJob(
  id: string,
  record: JobRecord,
  opts: {
    url: string;
    settings: CrawlSettings;
    onPhase?: (phase: Phase, msg?: string) => void;
    onProgress?: (progress: Progress) => void;
  },
): Promise<TraceReport> {
  const { progress, listeners } = record;

  const emitEvent = (ev: TraceEvent) => {
    for (const listener of [...listeners]) {
      try {
        listener(ev);
      } catch {}
    }
  };

  const emitProgress = () => {
    const snap = { ...progress };
    opts.onProgress?.(snap);
    emitEvent({ type: "progress", progress: snap });
  };

  const setPhase = (ph: Phase, msg?: string) => {
    progress.phase = ph;
    if (msg !== undefined) progress.message = msg;
    opts.onPhase?.(ph, msg);
    emitProgress();
  };

  try {
    const crawl = await crawlSite(opts.url, opts.settings, {
      onPhase: (ph, msg) => {
        setPhase(ph, msg);
      },
      onRobots: (s) => {
        progress.robots = s;
        emitProgress();
      },
      onUpdate: (u) => {
        progress.discovered = u.discovered;
        progress.analyzed = u.analyzed;
        progress.queued = u.queued;
        progress.depth = u.depth;
        progress.externalDomains = u.externalDomains;
        pushLog(progress.log, u.log);
        emitProgress();
      },
    });

    const report = await buildReport(
      {
        id,
        demo: false,
        startUrl: crawl.startUrl,
        siteHost: crawl.siteHost,
        pages: crawl.pages,
        policy: crawl.policy,
        notes: crawl.notes,
        favicon: crawl.favicon,
        durationMs: crawl.durationMs,
        settings: opts.settings,
      },
      (ph) => setPhase(ph),
    );

    await persist(report);
    progress.phase = "done";
    opts.onPhase?.("done");
    opts.onProgress?.({ ...progress });
    emitEvent({ type: "complete", report });
    listeners.clear();
    return report;
  } catch (e) {
    const code: ErrorCode = e instanceof TraceError ? e.code : "INTERNAL";
    const message = e instanceof TraceError ? e.message : "Unexpected error";
    if (!(e instanceof TraceError)) console.error("[trace] executeTrace failed", e);
    progress.phase = "error";
    progress.error = { code, message };
    opts.onPhase?.("error");
    opts.onProgress?.({ ...progress });
    if (db) {
      await db.update(t.websites).set({ status: "failed", error: { code, message } }).where(eq(t.websites.traceId, id)).catch(() => {});
    }
    emitEvent({ type: "error", error: { code, message } });
    listeners.clear();
    throw e;
  } finally {
    const timer = setTimeout(() => jobs.delete(id), 90_000);
    timer.unref?.();
  }
}

export async function startTrace(opts: { url: string; settings: CrawlSettings; limiterKey: string; host: string }): Promise<string> {
  const id = newTraceId();
  const record = await initTraceJob(id, opts.url, opts.settings);
  void runTraceJob(id, record, {
    url: opts.url,
    settings: opts.settings,
  })
    .catch(() => {})
    .finally(() => {
      releaseJob(opts.limiterKey, opts.host);
    });
  return id;
}

export async function executeTrace(opts: {
  id?: string;
  url: string;
  settings: CrawlSettings;
  onPhase?: (phase: Phase, msg?: string) => void;
  onProgress?: (progress: Progress) => void;
}): Promise<TraceReport> {
  const id = opts.id ?? newTraceId();
  const record = await initTraceJob(id, opts.url, opts.settings);
  return runTraceJob(id, record, opts);
}

export function subscribeTrace(id: string, listener: (event: TraceEvent) => void): (() => void) | null {
  evictMemoryCache();
  const record = jobs.get(id);
  if (!record) return null;
  if (record.progress.phase === "done") {
    const report = memoryReports.get(id);
    if (!report) return null;
    listener({ type: "complete", report });
    return () => {};
  }
  if (record.progress.phase === "error") {
    listener({
      type: "error",
      error: {
        code: (record.progress.error?.code as ErrorCode) ?? "INTERNAL",
        message: record.progress.error?.message ?? "Unexpected error",
      },
    });
    return () => {};
  }
  record.listeners.add(listener);
  listener({ type: "progress", progress: { ...record.progress } });
  return () => {
    record.listeners.delete(listener);
  };
}

export function saveReportInMemory(r: TraceReport, now = Date.now()) {
  evictMemoryCache(now);
  const parsed = Date.parse(r.createdAt);
  const createdMs = Number.isFinite(parsed) ? parsed : now;
  if (now - createdMs < LIMITS.RETENTION_MS) {
    memoryReports.set(r.id, r);
    memoryReportSavedAt.set(r.id, now);
    if (!r.demo && now - createdMs < LIMITS.CACHE_TTL_MS) {
      const key = urlKey(r.url);
      memoryWebsites.set(key, { id: r.id, url: r.url, urlKey: key, createdAt: new Date(createdMs) });
    }
  }
  evictMemoryCache(now);
}

export function getMemoryReport(id: string, now = Date.now()): TraceReport | undefined {
  evictMemoryCache(now);
  return memoryReports.get(id);
}

function pushLog(log: CrawlLogEntry[], e: CrawlLogEntry) {
  if (e.state !== "active") {
    const idx = log.findIndex((x) => x.path === e.path && x.state === "active");
    if (idx >= 0) {
      log[idx] = e;
      return;
    }
  }
  log.push(e);
  if (log.length > 40) log.shift();
}

async function chunked<T>(rows: T[], fn: (c: T[]) => Promise<unknown>, size = 800) {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
}

async function persist(r: TraceReport) {
  saveReportInMemory(r);
  if (!db) return;
  try {
    await db.transaction(async (tx) => {
      const [w] = await tx
        .update(t.websites)
        .set({ status: "complete", title: r.identity.title, description: r.identity.description, report: r as unknown as Record<string, unknown>, completedAt: new Date(), hostname: r.hostname, error: null })
        .where(eq(t.websites.traceId, r.id))
        .returning({ id: t.websites.id });
      if (!w) return;
      const wid = w.id;
      await chunked(r.pages, (c) =>
        tx.insert(t.pages).values(c.map((p) => ({ websiteId: wid, pageRef: p.id, url: p.url, path: p.path, title: p.title, status: p.status, depth: p.depth, pageType: p.type, section: p.section, wordCount: p.wordCount }))),
      );
      const linkRows = r.pages.flatMap((p) => p.links.map((l) => ({ websiteId: wid, sourcePageRef: p.id, targetUrl: l.url.slice(0, 1000), type: l.internal ? "internal" : "external", area: l.area, text: l.text.slice(0, 200) })));
      await chunked(linkRows, (c) => tx.insert(t.links).values(c), 1000);
      await chunked(r.assets, (c) => tx.insert(t.assets).values(c.map((a) => ({ websiteId: wid, pageRef: a.pageId, url: a.url.slice(0, 1000), type: a.type }))), 1000);
      if (r.technologies.length) await tx.insert(t.technologies).values(r.technologies.map((x) => ({ websiteId: wid, name: x.name, category: x.category, confidence: x.confidence, evidence: x.signals })));
      if (r.findings.length) await tx.insert(t.findings).values(r.findings.map((f) => ({ websiteId: wid, category: f.category, severity: f.severity, title: f.title, explanation: f.explanation, evidence: f.evidence })));
      if (r.journeys.length) await tx.insert(t.journeys).values(r.journeys.map((j) => ({ websiteId: wid, name: j.name, pages: j.steps.map((s) => s.label), confidence: j.confidence })));
    });
  } catch (e) {
    console.warn("[trace] DB persist failed, cached in memory", e);
  }
}

export type TraceState =
  | { status: "running"; progress: Progress }
  | { status: "failed"; error: { code: string; message: string } }
  | { status: "complete"; report: TraceReport }
  | { status: "missing" };

export async function getTraceState(id: string): Promise<TraceState> {
  if (id === "demo") return { status: "complete", report: await buildDemoReport() };
  evictMemoryCache();
  const live = jobs.get(id);
  if (live && live.progress.phase !== "done") {
    if (live.progress.phase === "error") return { status: "failed", error: live.progress.error ?? { code: "INTERNAL", message: "Failed" } };
    return { status: "running", progress: live.progress };
  }
  const mem = memoryReports.get(id);
  if (mem) return { status: "complete", report: mem };
  if (!db) return { status: "missing" };
  try {
    const rows = await db.select().from(t.websites).where(eq(t.websites.traceId, id)).limit(1);
    const row = rows[0];
    if (!row) return { status: "missing" };
    if (row.status === "complete" && row.report) return { status: "complete", report: row.report as unknown as TraceReport };
    if (row.status === "failed") return { status: "failed", error: row.error ?? { code: "INTERNAL", message: "Failed" } };
    // running in DB but no live job (server restarted)
    await db.update(t.websites).set({ status: "failed", error: { code: "INTERNAL", message: "The trace was interrupted." } }).where(eq(t.websites.traceId, id));
    return { status: "failed", error: { code: "INTERNAL", message: "The trace was interrupted." } };
  } catch {
    return { status: "missing" };
  }
}
