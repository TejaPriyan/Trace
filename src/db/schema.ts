import { integer, jsonb, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

// Website: one row per TRACE. `report` holds the full computed report used by the UI;
// the relational tables below hold the normalized data model for querying/export.
export const websites = pgTable(
  "websites",
  {
    id: serial("id").primaryKey(),
    traceId: text("trace_id").notNull().unique(),
    url: text("url").notNull(),
    urlKey: text("url_key").notNull(),
    hostname: text("hostname").notNull(),
    title: text("title"),
    description: text("description"),
    status: text("status").notNull().default("running"), // running | complete | failed
    error: jsonb("error").$type<{ code: string; message: string } | null>(),
    settings: jsonb("settings").$type<Record<string, unknown>>(),
    report: jsonb("report").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("websites_url_key_idx").on(t.urlKey), index("websites_created_idx").on(t.createdAt)],
);

export const pages = pgTable(
  "pages",
  {
    id: serial("id").primaryKey(),
    websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    pageRef: text("page_ref").notNull(),
    url: text("url").notNull(),
    path: text("path").notNull(),
    title: text("title"),
    status: integer("status"),
    depth: integer("depth").notNull(),
    pageType: text("page_type").notNull(),
    section: text("section"),
    wordCount: integer("word_count").notNull().default(0),
  },
  (t) => [index("pages_website_idx").on(t.websiteId)],
);

export const links = pgTable(
  "links",
  {
    id: serial("id").primaryKey(),
    websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    sourcePageRef: text("source_page_ref").notNull(),
    targetUrl: text("target_url").notNull(),
    type: text("type").notNull(), // internal | external
    area: text("area").notNull(),
    text: text("text"),
  },
  (t) => [index("links_website_idx").on(t.websiteId)],
);

export const assets = pgTable(
  "assets",
  {
    id: serial("id").primaryKey(),
    websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    pageRef: text("page_ref").notNull(),
    url: text("url").notNull(),
    type: text("type").notNull(),
    size: integer("size"), // not measured by the crawler — null
  },
  (t) => [index("assets_website_idx").on(t.websiteId)],
);

export const technologies = pgTable(
  "technologies",
  {
    id: serial("id").primaryKey(),
    websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull(),
    confidence: text("confidence").notNull(),
    evidence: jsonb("evidence").$type<{ signal: string; evidence: string }[]>().notNull(),
  },
  (t) => [index("tech_website_idx").on(t.websiteId)],
);

export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
    websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    severity: text("severity").notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    evidence: jsonb("evidence").$type<string[]>().notNull(),
  },
  (t) => [index("findings_website_idx").on(t.websiteId)],
);

export const journeys = pgTable(
  "journeys",
  {
    id: serial("id").primaryKey(),
    websiteId: integer("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pages: jsonb("pages").$type<string[]>().notNull(),
    confidence: text("confidence").notNull(),
  },
  (t) => [index("journeys_website_idx").on(t.websiteId)],
);
