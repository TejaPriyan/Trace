import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/trace/TRC-*"],
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot"],
        allow: ["/", "/compare", "/trace/demo"],
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://tracewebsite.vercel.app/sitemap.xml",
  };
}
