// Shared types for TRACE. Pure types only — safe to import from client and server.

export type PageType =
  | "Home"
  | "Product"
  | "Blog"
  | "Article"
  | "Documentation"
  | "Pricing"
  | "Contact"
  | "About"
  | "Legal"
  | "Login"
  | "Signup"
  | "Checkout"
  | "Unknown";

export const PAGE_TYPES: PageType[] = [
  "Home",
  "Product",
  "Pricing",
  "Blog",
  "Article",
  "Documentation",
  "About",
  "Contact",
  "Legal",
  "Login",
  "Signup",
  "Checkout",
  "Unknown",
];

export type Confidence = "High" | "Medium" | "Low";
export type TechCategory =
  | "Framework"
  | "Hosting"
  | "Analytics"
  | "CDN"
  | "Payment"
  | "CMS"
  | "Font"
  | "Server"
  | "Other";
export const TECH_CATEGORIES: TechCategory[] = [
  "Framework",
  "Hosting",
  "Analytics",
  "CDN",
  "Payment",
  "CMS",
  "Font",
  "Server",
  "Other",
];

export type DomainCategory =
  | "Analytics"
  | "Social"
  | "Payment"
  | "CDN"
  | "Fonts"
  | "Media"
  | "External resource"
  | "Unknown";

export interface CrawlSettings {
  maxPages: number;
  maxDepth: number;
  timeoutSec: number;
  jsRendering: "auto" | "off";
  analyzeAssets: boolean;
}

export type LinkArea = "nav" | "header" | "footer" | "main" | "other";

export interface LinkRef {
  url: string;
  text: string;
  area: LinkArea;
  internal: boolean;
  nofollow: boolean;
}
export interface ImageRef {
  src: string;
  alt: string | null;
  hasDimensions: boolean;
  lazy: boolean;
}
export interface FormRef {
  action: string;
  method: string;
  fields: number;
  labeled: number;
  hasPassword: boolean;
  hasEmail: boolean;
  text: string;
}
export interface ButtonRef {
  text: string;
  labelled: boolean;
}
export interface ScriptRef {
  src: string | null;
  async: boolean;
  defer: boolean;
  module: boolean;
  inHead: boolean;
}
export interface StyleRef {
  href: string;
  blocking: boolean;
}
export interface ResourceRef {
  url: string;
  kind: "api" | "graphql" | "feed" | "preconnect" | "manifest" | "form-action";
}
export interface TextBlock {
  text: string;
  cite: string | null; // external domain cited inside the same block, if any
}
export interface TechHit {
  name: string;
  category: TechCategory;
  confidence: Confidence;
  signal: string;
  evidence: string;
}
export interface HeadingRef {
  level: number;
  text: string;
}

/** Raw extraction of a single fetched page (output of the parser). */
export interface PageData {
  url: string;
  path: string;
  status: number | null; // null = request failed
  error: string | null;
  contentType: string | null;
  depth: number;
  parentUrl: string | null;
  responseMs: number;
  htmlBytes: number;
  compressed: boolean;
  title: string | null;
  description: string | null;
  canonical: string | null;
  lang: string | null;
  favicon: string | null;
  viewport: string | null;
  robotsMeta: string | null;
  og: Record<string, string>;
  twitter: Record<string, string>;
  jsonLd: string[];
  generator: string | null;
  headings: HeadingRef[];
  images: ImageRef[];
  links: LinkRef[];
  forms: FormRef[];
  buttons: ButtonRef[];
  scripts: ScriptRef[];
  inlineScripts: number;
  styles: StyleRef[];
  fontRefs: string[];
  iframes: string[];
  videos: number;
  audios: number;
  landmarks: { main: number; nav: number; header: number; footer: number; aside: number };
  wordCount: number;
  textHash: string | null;
  blocks: TextBlock[];
  ctas: string[];
  resources: ResourceRef[];
  tech: TechHit[];
  jsShell: boolean;
  redirectedFrom: string | null;
}

export interface PageReport extends PageData {
  id: string;
  type: PageType;
  typeBasis: string;
  section: string;
  incoming: string[];
  outgoing: string[];
  internalLinkCount: number;
  externalLinkCount: number;
  inPrimaryNav: boolean;
  orphanLike: boolean;
  techNames: string[];
  broken: boolean;
}

export type NodeKind = "page" | "external" | "asset" | "form" | "resource";
export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  pageId?: string;
  pageType?: PageType;
  section?: string;
  depth?: number;
  weight: number;
  category?: string;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "link" | "nav" | "external" | "asset" | "form" | "resource";
  count: number;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SectionInfo {
  id: string;
  label: string;
  category: string;
  pageIds: string[];
  basis: string;
}

export interface TechDetection {
  name: string;
  category: TechCategory;
  confidence: Confidence;
  signals: { signal: string; evidence: string }[];
  pageIds: string[];
}

export type CheckStatus = "pass" | "warn" | "fail" | "info";
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
  affected: string[]; // page ids
  evidence: string[];
}
export interface SignalGroup {
  key: "seo" | "a11y" | "perf";
  label: string;
  note: string;
  checks: Check[];
  metrics: { label: string; value: string }[];
}
export interface ScoreItem {
  sign: "+" | "-";
  text: string;
  points: number;
}
export interface ScoreBreakdown {
  key: "structure" | "content" | "seo" | "a11y" | "perf";
  label: string;
  score: number;
  method: string;
  items: ScoreItem[];
}

export interface Finding {
  id: string;
  category: "structure" | "content" | "seo" | "a11y" | "perf" | "tech" | "sources" | "policy";
  severity: "info" | "notice" | "warning";
  title: string;
  explanation: string;
  evidence: string[];
  pageIds: string[];
}
export interface MissedItem {
  id: string;
  kind: "orphan-like" | "deep-page" | "hidden-relationship" | "repeated-pattern" | "hub";
  title: string;
  explanation: string;
  evidence: string[];
  pageIds: string[];
}

export interface JourneyStep {
  label: string;
  pageId: string | null; // null = terminal form/step
  note?: string;
}
export interface Journey {
  id: string;
  name: string;
  confidence: Confidence;
  steps: JourneyStep[];
  basis: string;
}

export interface Claim {
  id: string;
  text: string;
  pageId: string;
  context: string;
  evidence: string;
  cite: string | null;
  related: string[];
}

export interface DomainInfo {
  domain: string;
  category: DomainCategory;
  refs: number;
  kinds: string[];
  pageIds: string[];
  samples: string[];
  subdomain: boolean;
}

export interface AssetRec {
  pageId: string;
  url: string;
  type: "script" | "style" | "image" | "font" | "iframe" | "media";
  host: string;
  external: boolean;
}
export interface FormRec extends FormRef {
  pageId: string;
}
export interface ResourceRec extends ResourceRef {
  pageId: string;
}

export interface CrawlPolicy {
  robotsFound: boolean;
  robotsStatus: number | null;
  sitemaps: string[];
  sitemapUrlCount: number | null;
  crawlDelaySec: number | null;
  disallowRules: number;
  blockedPaths: string[];
  summary: string;
}
export interface CrawlNotes {
  requestedPages: number;
  analyzedPages: number;
  partial: boolean;
  stopReason: string | null;
  jsShellPages: number;
  jsRenderingNote: string | null;
  errors: { url: string; error: string }[];
  unvisitedCount: number;
  sitemapNotCrawled: string[];
}

export interface Identity {
  title: string | null;
  description: string | null;
  canonical: string | null;
  lang: string | null;
  favicon: { url: string; accessible: boolean | null } | null;
  og: Record<string, string>;
  twitter: Record<string, string>;
}

export interface ContentSummary {
  typeCounts: { type: PageType; count: number }[];
  totalWords: number;
  avgWords: number;
  thinPages: string[];
  images: number;
  videos: number;
  audios: number;
  iframes: number;
  ctas: { text: string; count: number; pageIds: string[] }[];
  nav: { label: string; url: string; pageId: string | null; share: number }[];
  repeated: { text: string; count: number; pageIds: string[] }[];
  headingSamples: { pageId: string; h1: string | null; h2: string[] }[];
}

export interface ReportStats {
  pages: number;
  sections: number;
  internalLinks: number;
  externalLinks: number;
  assets: number;
  forms: number;
  techSignals: number;
  journeys: number;
  findings: number;
  brokenPages: number;
  maxDepth: number;
  externalDomains: number;
  claims: number;
  resources: number;
}

export interface TraceReport {
  id: string;
  demo: boolean;
  url: string;
  hostname: string;
  createdAt: string;
  durationMs: number;
  settings: CrawlSettings;
  policy: CrawlPolicy;
  notes: CrawlNotes;
  identity: Identity;
  stats: ReportStats;
  pages: PageReport[];
  sections: SectionInfo[];
  graph: GraphData;
  technologies: TechDetection[];
  content: ContentSummary;
  seo: SignalGroup;
  a11y: SignalGroup;
  perf: SignalGroup;
  scores: ScoreBreakdown[];
  findings: Finding[];
  missed: MissedItem[];
  journeys: Journey[];
  claims: Claim[];
  sources: DomainInfo[];
  assets: AssetRec[];
  forms: FormRec[];
  resources: ResourceRec[];
}

export type Phase =
  | "connecting"
  | "discovering"
  | "crawling"
  | "analyzing"
  | "mapping"
  | "tracing"
  | "reporting"
  | "done"
  | "error";
export const PHASES: Phase[] = [
  "connecting",
  "discovering",
  "crawling",
  "analyzing",
  "mapping",
  "tracing",
  "reporting",
];

export interface CrawlLogEntry {
  path: string;
  state: "ok" | "active" | "error" | "blocked";
  code?: number | null;
  ms?: number;
}
export interface Progress {
  phase: Phase;
  discovered: number;
  analyzed: number;
  queued: number;
  depth: number;
  externalDomains: number;
  maxPages: number;
  log: CrawlLogEntry[];
  startedAt: number;
  message: string | null;
  robots: string | null;
  error: { code: string; message: string } | null;
}

export type ErrorCode =
  | "INVALID_URL"
  | "BLOCKED"
  | "ROBOTS"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "EMPTY"
  | "RATE_LIMIT"
  | "INTERNAL";

export const ERROR_COPY: Record<ErrorCode, string> = {
  INVALID_URL: "That doesn't look like a valid public URL.",
  BLOCKED: "The website declined the request.",
  ROBOTS: "Crawling is restricted by the site's robots policy.",
  TIMEOUT: "The site didn't respond within the allowed time.",
  UNREACHABLE: "TRACE couldn't reach this website.",
  EMPTY: "No usable public pages were discovered.",
  RATE_LIMIT: "Too many traces requested. Please wait a moment and try again.",
  INTERNAL: "Something went wrong while tracing this website.",
};
