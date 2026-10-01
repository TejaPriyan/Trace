import type { Claim, PageReport } from "./types";

const CLAIM_RE = /\b(we|our|your|us)\b.*\b(help|helps|enable|enables|provide|provides|offer|offers|let|lets|allow|allows|built|build|designed|make|makes|power|powers|deliver|delivers|ensure|ensures|guarantee|guarantees|believe|are|is)\b|\b(trusted by|used by|leading|#1|fastest|most|best|secure|award|certified|guarantee|free|no credit card|\d[\d,.]*\s?(%|\+|k|m)?\s+(customers|users|teams|companies|developers|businesses|downloads|countries)|since \d{4}|powered by)\b/i;
const BOILERPLATE = /(cookie|copyright|©|all rights reserved|privacy policy|terms of|subscribe to our newsletter|javascript|skip to|sign in|log in)/i;
const STOP = new Set("the a an and or of to in for on with is are be by at as it its this that from your our you we us can will more all any not but have has how what who why when into out about their they them than then there these those been were was also over per each such just only get one two new".split(" "));

function keywords(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  );
}

export function extractClaims(pages: PageReport[]): Claim[] {
  const ok = pages.filter((p) => p.status !== null && p.status < 400);
  const kw = new Map<string, Set<string>>();
  for (const p of ok) {
    const text = [p.title, p.description, ...p.headings.map((h) => h.text), ...p.blocks.map((b) => b.text)].filter(Boolean).join(" ");
    kw.set(p.id, keywords(text));
  }
  const seen = new Set<string>();
  const claims: Claim[] = [];
  for (const p of ok) {
    const cands: { text: string; source: "desc" | "block"; cite: string | null; prev: string | null }[] = [];
    if (p.description && p.description.length >= 40) cands.push({ text: p.description, source: "desc", cite: null, prev: null });
    p.blocks.forEach((b, i) => cands.push({ text: b.text, source: "block", cite: b.cite, prev: i > 0 ? p.blocks[i - 1].text : null }));
    let n = 0;
    for (const c of cands) {
      if (n >= 3 || claims.length >= 40) break;
      const key = c.text.toLowerCase().slice(0, 80);
      if (seen.has(key) || BOILERPLATE.test(c.text) || !CLAIM_RE.test(c.text)) continue;
      seen.add(key);
      n++;
      const mine = keywords(c.text);
      const related: { id: string; score: number }[] = [];
      for (const o of ok) {
        if (o.id === p.id) continue;
        const ok2 = kw.get(o.id)!;
        let hit = 0;
        for (const w of mine) if (ok2.has(w)) hit++;
        const score = mine.size ? hit / mine.size : 0;
        if (hit >= 3 && score >= 0.5) related.push({ id: o.id, score });
      }
      related.sort((a, b) => b.score - a.score);
      claims.push({
        id: `c${claims.length}`,
        text: c.text,
        pageId: p.id,
        context: c.source === "desc" ? "Found in the page's meta description." : c.prev ? `Preceded on the page by: “${c.prev.slice(0, 140)}${c.prev.length > 140 ? "…" : ""}”` : `First text block detected on “${p.title ?? p.path}”.`,
        evidence: c.source === "desc" ? "Meta description" : c.cite ? `Page content, with a link to ${c.cite}` : "Page content",
        cite: c.cite,
        related: related.slice(0, 4).map((r) => r.id),
      });
    }
  }
  return claims;
}
