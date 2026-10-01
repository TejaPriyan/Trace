import "server-only";
import { LIMITS } from "./limits";

// In-memory limiter. Adequate for a single server process; swap for Redis if horizontally scaled.
const hits = new Map<string, number[]>();
const running = new Map<string, number>();
const hostLocks = new Set<string>();
let globalRunning = 0;

export function clientKey(req: Request): string {
  // Use the right-most X-Forwarded-For entry (appended by the nearest trusted proxy); the left-most is client-controlled.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip") ?? "local";
}

export function checkRate(key: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < LIMITS.TRACE_WINDOW_MS);
  if (arr.length >= LIMITS.TRACES_PER_IP_WINDOW) {
    hits.set(key, arr);
    return { ok: false, retryAfterSec: Math.ceil((LIMITS.TRACE_WINDOW_MS - (now - arr[0])) / 1000) };
  }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < LIMITS.TRACE_WINDOW_MS)) hits.delete(k);
  }
  return { ok: true, retryAfterSec: 0 };
}

export function acquireJob(key: string, host: string): { ok: true } | { ok: false; reason: string } {
  if (globalRunning >= LIMITS.CONCURRENT_JOBS_GLOBAL) return { ok: false, reason: "TRACE is busy. Please try again shortly." };
  if ((running.get(key) ?? 0) >= LIMITS.CONCURRENT_JOBS_PER_IP) return { ok: false, reason: "You already have traces running. Wait for one to finish." };
  if (hostLocks.has(host)) return { ok: false, reason: "This host is already being traced. Wait for it to finish." };
  globalRunning++;
  running.set(key, (running.get(key) ?? 0) + 1);
  hostLocks.add(host);
  return { ok: true };
}

export function releaseJob(key: string, host: string) {
  globalRunning = Math.max(0, globalRunning - 1);
  running.set(key, Math.max(0, (running.get(key) ?? 1) - 1));
  hostLocks.delete(host);
}
