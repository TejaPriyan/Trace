import type { CrawlSettings } from "./types";

// Server-controlled limits. Client-provided settings are always clamped to these.
export const LIMITS = {
  MAX_PAGES: 150,
  MAX_DEPTH: 8,
  MAX_TIMEOUT_SEC: 30,
  MIN_TIMEOUT_SEC: 3,
  MAX_RESPONSE_BYTES: 15 * 1024 * 1024,
  MAX_CONCURRENT_REQUESTS: 5,
  MAX_REDIRECTS: 6,
  MAX_CRAWL_MS: 180_000,
  REQUEST_DELAY_MS: 80,
  MAX_CRAWL_DELAY_MS: 2000,
  MAX_LINKS_PER_PAGE: 500,
  MAX_QUERY_VARIANTS_PER_PATH: 4,
  // rate limits
  TRACES_PER_IP_WINDOW: 20,
  TRACE_WINDOW_MS: 10 * 60 * 1000,
  CONCURRENT_JOBS_PER_IP: 4,
  CONCURRENT_JOBS_GLOBAL: 8,
  // cache
  CACHE_TTL_MS: 60 * 60 * 1000,
  RETENTION_MS: 7 * 24 * 60 * 60 * 1000,
} as const;

export const DEFAULT_SETTINGS: CrawlSettings = {
  maxPages: 40,
  maxDepth: 4,
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

export function parseSettingsParams(params: URLSearchParams): CrawlSettings {
  const raw: Record<string, unknown> = {};
  const json = params.get("settings");
  if (json) {
    try {
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        Object.assign(raw, parsed);
      }
    } catch {}
  }
  const numParam = (k: string) => {
    const v = params.get(k);
    if (v !== null && v !== "") {
      const n = Number(v);
      if (Number.isFinite(n)) raw[k] = n;
    }
  };
  numParam("maxPages");
  numParam("maxDepth");
  numParam("timeoutSec");
  const js = params.get("jsRendering");
  if (js === "auto" || js === "off") raw.jsRendering = js;
  const assets = params.get("analyzeAssets");
  if (assets === "false" || assets === "0") raw.analyzeAssets = false;
  else if (assets === "true" || assets === "1") raw.analyzeAssets = true;
  return clampSettings(raw as Partial<CrawlSettings>);
}
