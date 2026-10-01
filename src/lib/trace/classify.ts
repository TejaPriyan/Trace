import type { PageData, PageType, SectionInfo } from "./types";

const RULES: [RegExp, PageType][] = [
  [/(^|\/)(log-?in|sign-?in|signin|auth|account\/login|sso)(\/|$|\.)/i, "Login"],
  [/(^|\/)(sign-?up|register|join|get-started|start|trial|free-trial|onboarding)(\/|$|\.)/i, "Signup"],
  [/(^|\/)(checkout|cart|basket|bag|order|payment)(\/|$|\.)/i, "Checkout"],
  [/(^|\/)(pricing|plans?|prices?|packages)(\/|$|\.)/i, "Pricing"],
  [/(^|\/)(contact|contact-us|support|get-in-touch|reach-us|talk-to-us)(\/|$|\.)/i, "Contact"],
  [/(^|\/)(about|about-us|team|company|careers?|jobs|story|mission|who-we-are|people)(\/|$|\.)/i, "About"],
  [/(^|\/)(privacy|terms|legal|cookies?|gdpr|imprint|disclaimer|tos|policy|policies|security-policy|licen[cs]e)(\/|$|\.|-)/i, "Legal"],
  [/(^|\/)(docs?|documentation|guides?|reference|api|manual|learn|tutorials?|handbook|help|kb|knowledge-?base|faq)(\/|$|\.)/i, "Documentation"],
  [/(^|\/)(blog|news|articles?|posts?|journal|insights|stories|press|updates|changelog|resources)(\/|$|\.)/i, "Blog"],
  [/(^|\/)(products?|shop|store|items?|solutions?|features?|catalog|collections?|services?|platform|apps?|p)(\/|$|\.)/i, "Product"],
];

export function classifyPage(p: PageData): { type: PageType; basis: string } {
  let pathname = "/";
  try {
    pathname = new URL(p.url).pathname;
  } catch {}
  if (pathname === "/" || pathname === "") return { type: "Home", basis: "Root path" };
  const segs = pathname.split("/").filter(Boolean);
  const lower = pathname.toLowerCase();
  for (const [re, type] of RULES) {
    const m = re.exec(lower);
    if (!m) continue;
    if (type === "Blog") {
      const idx = segs.findIndex((s) => re.test("/" + s.toLowerCase()));
      if (segs.length > idx + 1) return { type: "Article", basis: `Path under "/${segs[idx]}" with a sub-path` };
      return { type: "Blog", basis: `Path contains "${segs[idx] ?? m[2]}"` };
    }
    if (type === "Documentation") return { type: "Documentation", basis: `Path contains "${m[2]}"` };
    return { type, basis: `Path contains "${m[2]}"` };
  }
  if (/\/\d{4}\/\d{1,2}(\/|$)/.test(lower)) return { type: "Article", basis: "Date-style path" };
  if (p.jsonLd.some((t) => /^(Article|BlogPosting|NewsArticle|TechArticle)$/i.test(t))) return { type: "Article", basis: "Structured data type Article" };
  if (p.og["og:type"] === "article") return { type: "Article", basis: "og:type is article" };
  if (p.jsonLd.some((t) => /^(Product|Offer)$/i.test(t))) return { type: "Product", basis: "Structured data type Product" };
  if (p.jsonLd.includes("FAQPage")) return { type: "Documentation", basis: "Structured data type FAQPage" };
  if (p.forms.some((f) => f.hasPassword)) return { type: "Login", basis: "Page contains a password field" };
  if (p.jsonLd.includes("ContactPage")) return { type: "Contact", basis: "Structured data type ContactPage" };
  return { type: "Unknown", basis: "No matching path or metadata signal" };
}

const CATEGORY_HINTS: [RegExp, string][] = [
  [/(blog|news|article|post|journal|stories|press|insights|resources)/i, "Content"],
  [/(docs?|guide|reference|api|learn|tutorial|help|kb|faq|handbook)/i, "Documentation"],
  [/(product|shop|store|solution|feature|catalog|collection|service|platform|pricing|plans?)/i, "Product"],
  [/(login|signin|signup|register|account|checkout|cart|dashboard)/i, "Account"],
  [/(privacy|terms|legal|cookie|policy)/i, "Legal"],
  [/(about|team|company|careers|contact|support)/i, "Company"],
];

const TYPE_SECTION: Partial<Record<PageType, string>> = {
  Home: "Core",
  About: "Core",
  Contact: "Core",
  Legal: "Legal",
  Login: "Account",
  Signup: "Account",
  Checkout: "Account",
  Blog: "Content",
  Article: "Content",
  Documentation: "Documentation",
  Product: "Product",
  Pricing: "Product",
};

/** Infer sections from the first path segment; singleton segments fall back to their page type. */
export function inferSections(pages: { id: string; path: string; type: PageType }[]): { sections: SectionInfo[]; map: Map<string, string> } {
  const seg = (p: string) => p.split("?")[0].split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  const bySeg = new Map<string, string[]>();
  for (const p of pages) {
    const s = seg(p.path);
    if (!bySeg.has(s)) bySeg.set(s, []);
    bySeg.get(s)!.push(p.id);
  }
  const assign = new Map<string, string>(); // pageId -> section label
  const basis = new Map<string, string>();
  for (const p of pages) {
    const s = seg(p.path);
    const group = bySeg.get(s)!;
    if (s && group.length >= 2) {
      assign.set(p.id, s.replace(/[-_]/g, " ").toUpperCase());
      basis.set(s.replace(/[-_]/g, " ").toUpperCase(), `Shared first path segment "/${s}"`);
    } else {
      const label = (TYPE_SECTION[p.type] ?? "Core").toUpperCase();
      assign.set(p.id, label);
      if (!basis.has(label)) basis.set(label, "Grouped by inferred page type (no shared path prefix)");
    }
  }
  const byLabel = new Map<string, string[]>();
  for (const [id, label] of assign) {
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label)!.push(id);
  }
  const sections: SectionInfo[] = [...byLabel.entries()].map(([label, ids]) => {
    const hint = CATEGORY_HINTS.find(([re]) => re.test(label))?.[1] ?? (label === "CORE" ? "Core" : "General");
    return { id: "s:" + label.toLowerCase().replace(/\s+/g, "-"), label, category: hint, pageIds: ids, basis: basis.get(label) ?? "Inferred" };
  });
  sections.sort((a, b) => (a.label === "CORE" ? -1 : b.label === "CORE" ? 1 : b.pageIds.length - a.pageIds.length));
  const map = new Map<string, string>();
  for (const s of sections) for (const id of s.pageIds) map.set(id, s.id);
  return { sections, map };
}
