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

export function getRecent(): RecentTrace[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as RecentTrace[]) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.id === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function addRecent(r: RecentTrace) {
  try {
    const list = [r, ...getRecent().filter((x) => x.id !== r.id)].slice(0, 10);
    localStorage.setItem(KEY, JSON.stringify(list));
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
