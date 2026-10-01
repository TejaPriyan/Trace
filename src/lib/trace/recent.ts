// Client-side helper: remembers traces opened in this browser (no server-side listing to avoid enumeration).
export interface RecentTrace {
  id: string;
  hostname: string;
  pages: number;
  at: string;
}
const KEY = "trace.recent";

export function getRecent(): RecentTrace[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as RecentTrace[]) : [];
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.id === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}
export function addRecent(r: RecentTrace) {
  try {
    const list = [r, ...getRecent().filter((x) => x.id !== r.id)].slice(0, 8);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
}
