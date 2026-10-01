import { getTraceState, isTraceId } from "@/lib/trace/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // neutralize spreadsheet formula injection from untrusted crawled text
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isTraceId(id)) return new Response("Not found", { status: 404 });
  const state = await getTraceState(id);
  if (state.status !== "complete") return new Response("Not available", { status: 404 });
  const r = state.report;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const kind = url.searchParams.get("kind") ?? "pages";
  const name = `trace-${r.hostname}-${r.id}`;
  if (format === "json") {
    return new Response(JSON.stringify(r, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${name}.json"`, "x-content-type-options": "nosniff" },
    });
  }
  let rows: unknown[][] = [];
  if (kind === "pages")
    rows = [["url", "path", "title", "type", "section", "depth", "status", "internal_links", "external_links", "incoming", "outgoing", "words", "response_ms"], ...r.pages.map((p) => [p.url, p.path, p.title, p.type, r.sections.find((x) => x.id === p.section)?.label ?? p.section, p.depth, p.status, p.internalLinkCount, p.externalLinkCount, p.incoming.length, p.outgoing.length, p.wordCount, p.responseMs])];
  else if (kind === "technologies")
    rows = [["name", "category", "confidence", "signals", "pages"], ...r.technologies.map((t) => [t.name, t.category, t.confidence, t.signals.map((s) => s.evidence).join(" | "), t.pageIds.length])];
  else if (kind === "findings")
    rows = [["category", "severity", "title", "explanation", "evidence"], ...r.findings.map((f) => [f.category, f.severity, f.title, f.explanation, f.evidence.join(" | ")])];
  else if (kind === "sources")
    rows = [["domain", "category", "references", "pages", "kinds"], ...r.sources.map((d) => [d.domain, d.category, d.refs, d.pageIds.length, d.kinds.join(" ")])];
  else if (kind === "links") {
    const byId = new Map(r.pages.map((p) => [p.id, p.url]));
    rows = [["source", "target", "type", "area", "text"], ...r.pages.flatMap((p) => p.links.map((l) => [byId.get(p.id), l.url, l.internal ? "internal" : "external", l.area, l.text]))];
  } else return new Response("Unknown kind", { status: 400 });
  return new Response(toCsv(rows), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}-${kind}.csv"`, "x-content-type-options": "nosniff" },
  });
}
