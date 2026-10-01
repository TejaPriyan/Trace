import type { ContentSummary, CrawlNotes, CrawlPolicy, DomainInfo, Finding, MissedItem, PageReport, SectionInfo, TechDetection } from "./types";
import type { Adj } from "./graph";
import { isOkPage } from "./signals";

interface Input {
  pages: PageReport[];
  sections: SectionInfo[];
  adj: Map<string, Adj[]>;
  sources: DomainInfo[];
  technologies: TechDetection[];
  content: ContentSummary;
  policy: CrawlPolicy;
  notes: CrawlNotes;
  hostname: string;
  startUrl: string;
  navDetected: boolean;
}

const plural = (n: number, s: string, p = s + "s") => `${n} ${n === 1 ? s : p}`;

export function buildFindings(i: Input): Finding[] {
  const { pages, sources, technologies, content, policy, notes } = i;
  const ok = pages.filter(isOkPage);
  const out: Finding[] = [];
  const add = (category: Finding["category"], severity: Finding["severity"], title: string, explanation: string, evidence: string[], pageIds: string[] = []) =>
    out.push({ id: `f${out.length}`, category, severity, title, explanation, evidence: evidence.slice(0, 8), pageIds });
  const ids = (ps: PageReport[]) => ps.map((p) => p.id);
  const paths = (ps: PageReport[]) => ps.slice(0, 8).map((p) => p.path);

  if (notes.partial) add("policy", "notice", `TRACE analyzed ${notes.analyzedPages} of ${notes.requestedPages} requested pages before stopping.`, `Stop reason: ${notes.stopReason}. ${notes.unvisitedCount} discovered URL(s) were not fetched, so counts are a lower bound.`, []);
  const titleGroups = new Map<string, PageReport[]>();
  for (const p of ok) if (p.title) titleGroups.set(p.title, [...(titleGroups.get(p.title) ?? []), p]);
  const dup = [...titleGroups.values()].filter((g) => g.length > 1).sort((a, b) => b.length - a.length);
  if (dup.length) add("seo", "warning", `${dup[0].length} pages share the same title.`, `The title “${dup[0][0].title!.slice(0, 80)}” is used on more than one page${dup.length > 1 ? `; ${dup.length} duplicate title groups in total` : ""}.`, paths(dup[0]), ids(dup[0]));
  const noDesc = ok.filter((p) => !p.description);
  if (noDesc.length) add("seo", noDesc.length / ok.length > 0.5 ? "warning" : "notice", `${plural(noDesc.length, "page")} ${noDesc.length === 1 ? "has" : "have"} no meta description.`, "No <meta name=\"description\"> was detected in the server-delivered HTML.", paths(noDesc), ids(noDesc));
  const noH1 = ok.filter((p) => !p.headings.some((h) => h.level === 1 && h.text));
  if (noH1.length) add("content", "notice", `${plural(noH1.length, "page")} ${noH1.length === 1 ? "has" : "have"} no H1.`, "No H1 heading was found in the server HTML.", paths(noH1), ids(noH1));
  const broken = pages.filter((p) => p.broken);
  if (broken.length) {
    const referrers = broken.slice(0, 5).map((b) => {
      const from = pages.filter((p) => (i.adj.get(p.id) ?? []).some((e) => e.to === b.id)).slice(0, 2).map((p) => p.path);
      return `${b.path} (${b.status ?? "failed"})${from.length ? " ← " + from.join(", ") : ""}`;
    });
    add("structure", "warning", `${plural(broken.length, "linked page")} returned an error.`, "Internal links lead to pages that returned an HTTP error or failed to load.", referrers, ids(broken));
  }
  // most reachable page
  const topIn = [...ok].filter((p) => p.type !== "Home").sort((a, b) => b.incoming.length - a.incoming.length)[0];
  if (topIn && topIn.incoming.length >= 3) add("structure", "info", `${topIn.path} is linked from ${topIn.incoming.length} different pages.`, "It is the most-referenced page after the start page, a signal of its importance within the site structure.", pages.filter((p) => topIn.incoming.includes(p.id)).slice(0, 8).map((p) => p.path), [topIn.id]);
  const notNav = ok.filter((p) => p.depth > 0 && !p.inPrimaryNav);
  if (i.navDetected && notNav.length) add("structure", "info", `${plural(notNav.length, "page")} ${notNav.length === 1 ? "is" : "are"} not linked from the main navigation.`, "They were discovered through other links (body, footer, or other pages) but not through the start page's navigation.", paths(notNav), ids(notNav));
  if (!i.navDetected) add("structure", "notice", "No primary navigation was detected on the start page.", "No links inside <nav> or <header> were found in the server-delivered HTML of the start page.", []);
  const topDom = sources.filter((d) => d.pageIds.length >= 3).sort((a, b) => b.pageIds.length - a.pageIds.length)[0];
  if (topDom) add("sources", "info", `One external domain appears across ${topDom.pageIds.length} pages.`, `${topDom.domain} (${topDom.category}) is referenced ${topDom.refs} time${topDom.refs === 1 ? "" : "s"} via ${topDom.kinds.join(", ")}.`, topDom.samples, topDom.pageIds);
  const missAlt = ok.map((p) => ({ p, n: p.images.filter((im) => im.alt === null).length })).filter((x) => x.n);
  const missAltN = missAlt.reduce((a, x) => a + x.n, 0);
  if (missAltN) add("a11y", "warning", `${plural(missAltN, "image")} ${missAltN === 1 ? "has" : "have"} no alt attribute.`, `Found across ${plural(missAlt.length, "page")}. Decorative images should use alt="" explicitly.`, missAlt.slice(0, 6).map((x) => `${x.p.path} — ${x.n}`), missAlt.map((x) => x.p.id));
  const articles = ok.filter((p) => p.type === "Article");
  if (articles.length >= 2) add("content", "info", `The site contains ${articles.length} article-like pages.`, "Classified by path structure or article metadata (inferred).", paths(articles), ids(articles));
  const thin = ok.filter((p) => !["Login", "Signup", "Checkout", "Contact", "Legal"].includes(p.type) && p.wordCount < 150);
  if (thin.length) add("content", "notice", `${plural(thin.length, "page")} ${thin.length === 1 ? "has" : "have"} under 150 words of content.`, "Word counts are based on server-delivered HTML.", thin.slice(0, 8).map((p) => `${p.path} — ${p.wordCount} words`), ids(thin));
  const dupBody = new Map<string, PageReport[]>();
  for (const p of ok) if (p.textHash) dupBody.set(p.textHash, [...(dupBody.get(p.textHash) ?? []), p]);
  const dupB = [...dupBody.values()].filter((g) => g.length > 1);
  if (dupB.length) add("content", "warning", `${dupB[0].length} pages share near-identical body text.`, "Identical hashes of normalized body text.", paths(dupB[0]), ids(dupB[0]));
  const deepest = [...ok].sort((a, b) => b.depth - a.depth)[0];
  if (deepest && deepest.depth >= 2) add("structure", "info", `The deepest analyzed page is ${deepest.depth} clicks from the start page.`, `${deepest.path} was discovered at crawl depth ${deepest.depth}.`, [deepest.path], [deepest.id]);
  const jsPages = ok.filter((p) => p.jsShell);
  if (jsPages.length) add("tech", "notice", `${plural(jsPages.length, "page")} ${jsPages.length === 1 ? "appears" : "appear"} to need JavaScript to render content.`, notes.jsRenderingNote ?? "Server HTML contains very little text and loads scripts.", paths(jsPages), ids(jsPages));
  const analytics = technologies.filter((t) => t.category === "Analytics");
  if (analytics.length) add("tech", "info", `${plural(analytics.length, "analytics/tracking signal")} detected.`, analytics.map((a) => `${a.name} (${a.confidence})`).join(", "), analytics.map((a) => a.signals[0]?.evidence ?? a.name));
  const fw = technologies.filter((t) => t.category === "Framework" && t.confidence !== "Low");
  if (fw.length) add("tech", "info", `Detected framework signals: ${fw.slice(0, 4).map((f) => f.name).join(", ")}.`, "Based on observable markup, resource paths and headers.", fw.slice(0, 4).map((f) => `${f.name}: ${f.signals[0]?.evidence ?? ""}`));
  const pw = ok.filter((p) => p.forms.some((f) => f.hasPassword));
  if (pw.length) add("structure", "info", `Password forms found on ${plural(pw.length, "page")}.`, "Interpreted as login/registration entry points. TRACE does not crawl authenticated areas.", paths(pw), ids(pw));
  if (policy.sitemapUrlCount === null) add("seo", "notice", "No sitemap detected.", "Neither robots.txt nor /sitemap.xml exposed a readable sitemap.", []);
  else if (!notes.partial && notes.sitemapNotCrawled.length) add("structure", "notice", `${plural(notes.sitemapNotCrawled.length, "sitemap URL")} ${notes.sitemapNotCrawled.length === 1 ? "was" : "were"} not found through links.`, "These URLs are listed in the sitemap but were not reached by following internal links within the depth limit.", notes.sitemapNotCrawled.slice(0, 8));
  if (!policy.robotsFound) add("policy", "info", "No robots.txt found.", "No crawl restrictions were declared. TRACE still limits pages, depth and request rate.", []);
  else if (policy.blockedPaths.length) add("policy", "notice", `${plural(policy.blockedPaths.length, "URL")} skipped due to robots.txt.`, "TRACE honors Disallow rules that apply to TraceBot or *.", policy.blockedPaths.slice(0, 8));
  if (i.startUrl.startsWith("http://")) add("tech", "warning", "The start URL was served over plain HTTP.", "No redirect to HTTPS was observed for the start page.", [i.startUrl]);
  const mixed = ok.filter((p) => p.url.startsWith("https://") && (p.scripts.some((s) => s.src?.startsWith("http://")) || p.styles.some((s) => s.href.startsWith("http://"))));
  if (mixed.length) add("tech", "warning", `${plural(mixed.length, "page")} load scripts or styles over plain HTTP.`, "Observed in <script src> / <link rel=stylesheet> attributes of HTTPS pages.", paths(mixed), ids(mixed));
  const slow = ok.filter((p) => p.responseMs > 1500);
  if (slow.length) add("perf", "notice", `${plural(slow.length, "page")} took over 1.5 s to respond.`, "Measured from the TRACE crawler region; real-world timing differs.", slow.slice(0, 6).map((p) => `${p.path} — ${p.responseMs} ms`), ids(slow));
  if (content.repeated.length) add("content", "info", `${plural(content.repeated.length, "text block")} ${content.repeated.length === 1 ? "repeats" : "repeat"} across multiple pages.`, "Identical text appears in the main content of several pages.", content.repeated.slice(0, 4).map((r) => `“${r.text.slice(0, 80)}” ×${r.count}`));
  return out;
}

export function buildMissed(i: Input): MissedItem[] {
  const { pages, sections, adj, content } = i;
  const ok = pages.filter(isOkPage);
  const out: MissedItem[] = [];
  const add = (kind: MissedItem["kind"], title: string, explanation: string, evidence: string[], pageIds: string[]) =>
    out.push({ id: `m${out.length}`, kind, title, explanation, evidence: evidence.slice(0, 8), pageIds });
  const orphans = ok.filter((p) => p.orphanLike);
  if (orphans.length)
    add("orphan-like", `${plural(orphans.length, "orphan-like page")}`, "Discovered through links, but absent from the primary navigation and linked from at most one other page. They may be hard for visitors to find.", orphans.slice(0, 8).map((p) => `${p.path} — ${p.incoming.length} incoming link${p.incoming.length === 1 ? "" : "s"}${p.parentUrl ? ", found via " + safePath(p.parentUrl) : ""}`), orphans.map((p) => p.id));
  const deep = ok.filter((p) => p.depth >= 3);
  if (deep.length) add("deep-page", `${plural(deep.length, "deep page")}`, "These pages need three or more clicks from the start page.", deep.slice(0, 8).map((p) => `${p.path} — depth ${p.depth}`), deep.map((p) => p.id));
  // section cross-links
  const secOf = new Map<string, string>();
  sections.forEach((s) => s.pageIds.forEach((id) => secOf.set(id, s.id)));
  const label = new Map(sections.map((s) => [s.id, s.label]));
  const cross = new Map<string, number>();
  for (const [from, list] of adj) for (const e of list) {
    const a = secOf.get(from);
    const b = secOf.get(e.to);
    if (a && b && a !== b) {
      const k = [a, b].sort().join("|");
      cross.set(k, (cross.get(k) ?? 0) + 1);
    }
  }
  const top = [...cross.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    const [a, b] = top[0].split("|");
    add("hidden-relationship", `${label.get(a)} and ${label.get(b)} are strongly connected`, `${top[1]} internal links connect pages of these two inferred sections — the strongest cross-section relationship found.`, [`${label.get(a)} ↔ ${label.get(b)}: ${top[1]} links`], [...(sections.find((s) => s.id === a)?.pageIds ?? []), ...(sections.find((s) => s.id === b)?.pageIds ?? [])]);
  }
  const cta = content.ctas[0];
  if (cta && cta.pageIds.length >= 3 && cta.pageIds.length / Math.max(1, ok.length) >= 0.4)
    add("repeated-pattern", `Repeated call-to-action: “${cta.text}”`, `This CTA text appears on ${cta.pageIds.length} of ${ok.length} analyzed pages.`, [cta.text], cta.pageIds);
  const navSig = new Map<string, PageReport[]>();
  for (const p of ok) {
    const sig = p.links.filter((l) => l.area === "nav" || l.area === "header").map((l) => l.url).join("|");
    if (sig) navSig.set(sig, [...(navSig.get(sig) ?? []), p]);
  }
  const bigNav = [...navSig.values()].sort((a, b) => b.length - a.length)[0];
  if (bigNav && bigNav.length >= 3) add("repeated-pattern", `${bigNav.length} pages share an identical navigation structure`, "The same ordered set of navigation links appears on each of these pages.", bigNav.slice(0, 6).map((p) => p.path), bigNav.map((p) => p.id));
  const hub = [...ok].sort((a, b) => b.outgoing.length - a.outgoing.length)[0];
  if (hub && hub.outgoing.length >= 10) add("hub", `${hub.path} is a hub`, `It links to ${hub.outgoing.length} other analyzed pages — the most of any page.`, [hub.path], [hub.id]);
  return out;
}

function safePath(u: string) {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
}
