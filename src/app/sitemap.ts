import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://tracewebsite.vercel.app";
  const now = new Date();

  return [
    ...["about.html", "contact.html", "privacy.html", "terms.html", "guides/index.html", "guides/first-audit.html", "guides/read-performance-findings.html"].map((path) => ({ url: `${baseUrl}/${path}`, lastModified: now })),
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/trace/demo`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
