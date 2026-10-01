import "server-only";
import { safeFetch } from "./safe-fetch";

interface Rule {
  allow: boolean;
  pattern: string;
  re: RegExp;
}
export interface RobotsInfo {
  found: boolean;
  status: number | null;
  rules: Rule[];
  sitemaps: string[];
  crawlDelaySec: number | null;
  disallowCount: number;
}

function toRegex(p: string): RegExp {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp("^" + esc);
}

export function parseRobots(text: string): Omit<RobotsInfo, "found" | "status"> {
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = [];
  const sitemaps: string[] = [];
  let cur: { agents: string[]; rules: Rule[]; delay: number | null } | null = null;
  let lastWasAgent = false;
  for (const lineRaw of text.split(/\r?\n/).slice(0, 5000)) {
    const line = lineRaw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], rules: [], delay: null };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (key === "sitemap") {
      if (/^https?:\/\//i.test(val)) sitemaps.push(val);
    } else if (cur && (key === "disallow" || key === "allow")) {
      if (val === "" && key === "disallow") continue;
      if (val.length > 500) continue;
      cur.rules.push({ allow: key === "allow", pattern: val, re: toRegex(val) });
    } else if (cur && key === "crawl-delay") {
      const d = Number(val);
      if (Number.isFinite(d) && d >= 0) cur.delay = d;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && "tracebot".includes(a) && a.length > 2));
  const star = groups.filter((g) => g.agents.includes("*"));
  const chosen = mine.length ? mine : star;
  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.find((g) => g.delay !== null)?.delay ?? null;
  return { rules, sitemaps, crawlDelaySec: delay, disallowCount: rules.filter((r) => !r.allow).length };
}

export function isAllowed(info: RobotsInfo | null, pathAndQuery: string): boolean {
  if (!info || !info.found) return true;
  let best: Rule | null = null;
  for (const r of info.rules) {
    if (!r.re.test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}

export async function fetchRobots(origin: string, timeoutMs: number): Promise<RobotsInfo> {
  try {
    const r = await safeFetch(origin + "/robots.txt", {
      timeoutMs,
      maxBytes: 512 * 1024,
      accept: "text/plain,*/*;q=0.5",
      bodyFilter: (h) => !/text\/html/i.test(h["content-type"] || ""),
    });
    if (r.status >= 200 && r.status < 300 && !r.skippedBody) {
      return { found: true, status: r.status, ...parseRobots(r.body.toString("utf8")) };
    }
    return { found: false, status: r.status, rules: [], sitemaps: [], crawlDelaySec: null, disallowCount: 0 };
  } catch {
    return { found: false, status: null, rules: [], sitemaps: [], crawlDelaySec: null, disallowCount: 0 };
  }
}
