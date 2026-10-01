import type { CrawlSettings } from "./types";

// Server-controlled limits. Client-provided settings are always clamped to these.
export const LIMITS = {
  MAX_PAGES: 50,
  MAX_DEPTH: 4,
  MAX_TIMEOUT_SEC: 30,
  MIN_TIMEOUT_SEC: 3,
  MAX_RESPONSE_BYTES: 10 * 1024 * 1024,
  MAX_CONCURRENT_REQUESTS: 3,
  MAX_REDIRECTS: 5,
  MAX_CRAWL_MS: 150_000,
  REQUEST_DELAY_MS: 200,
  MAX_CRAWL_DELAY_MS: 3000,
  MAX_LINKS_PER_PAGE: 400,
  MAX_QUERY_VARIANTS_PER_PATH: 3,
  // rate limits
  TRACES_PER_IP_WINDOW: 10,
  TRACE_WINDOW_MS: 10 * 60 * 1000,
  CONCURRENT_JOBS_PER_IP: 4,
  CONCURRENT_JOBS_GLOBAL: 8,
  // cache
  CACHE_TTL_MS: 60 * 60 * 1000,
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export const DEFAULT_SETTINGS: CrawlSettings = {
  maxPages: 25,
  maxDepth: 3,
  timeoutSec: 15,
  jsRendering: "auto",
  analyzeAssets: true,
};

export function clampSettings(input: Partial<CrawlSettings> | undefined | null): CrawlSettings {
  const n = (v: unknown, d: number, min: number, max: number) => {
    const x = typeof v === "number" && Number.isFinite(v) ? Math.floor(v) : d;
    return Math.min(max, Math.max(min, x));
  };
  return {
    maxPages: n(input?.maxPages, DEFAULT_SETTINGS.maxPages, 1, LIMITS.MAX_PAGES),
    maxDepth: n(input?.maxDepth, DEFAULT_SETTINGS.maxDepth, 0, LIMITS.MAX_DEPTH),
    timeoutSec: n(input?.timeoutSec, DEFAULT_SETTINGS.timeoutSec, LIMITS.MIN_TIMEOUT_SEC, LIMITS.MAX_TIMEOUT_SEC),
    jsRendering: input?.jsRendering === "off" ? "off" : "auto",
    analyzeAssets: input?.analyzeAssets === false ? false : true,
  };
}
