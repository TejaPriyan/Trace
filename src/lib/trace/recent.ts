// Client-side helper: remembers traces opened in this browser (no server-side listing to avoid enumeration).
export interface RecentTrace {
  id: string;
  url?: string;
  hostname: string;
  pages: number;
  at: string;
}
const KEY = "trace.recent";
const REPORT_PREFIX = "trace.report.";

const EMPTY_RECENT: RecentTrace[] = [];
let cachedRaw: string | null = null;
let cachedList: RecentTrace[] = EMPTY_RECENT;

export function getRecent(): RecentTrace[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as RecentTrace[]) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.id === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function getRecentSnapshot(): RecentTrace[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cachedRaw) return cachedList;
    cachedRaw = raw;
    const arr = raw ? (JSON.parse(raw) as RecentTrace[]) : [];
    cachedList = Array.isArray(arr) ? arr.filter((r) => r && typeof r.id === "string").slice(0, 10) : EMPTY_RECENT;
    return cachedList;
  } catch {
    return EMPTY_RECENT;
  }
}

export function getRecentServerSnapshot(): RecentTrace[] {
  return EMPTY_RECENT;
}

export function subscribeRecent(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("trace:recent", cb);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("trace:recent", cb);
  };
}

export function addRecent(r: RecentTrace) {
  try {
    const list = [r, ...getRecent().filter((x) => x.id !== r.id)].slice(0, 10);
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("trace:recent"));
  } catch {}
}

export function saveLocalReport(report: unknown & { id: string }) {
  try {
    if (!report || !report.id) return;
    localStorage.setItem(`${REPORT_PREFIX}${report.id}`, JSON.stringify(report));
    // Clean up older reports if storage gets full
    const recentIds = new Set(getRecent().map((r) => r.id));
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(REPORT_PREFIX)) {
        const id = k.replace(REPORT_PREFIX, "");
        if (!recentIds.has(id) && id !== report.id) {
          localStorage.removeItem(k);
        }
      }
    }
  } catch {}
}

export function getLocalReport<T = unknown>(id: string): T | null {
  try {
    const item = localStorage.getItem(`${REPORT_PREFIX}${id}`);
    if (!item) return null;
    return JSON.parse(item) as T;
  } catch {
    return null;
  }
}
