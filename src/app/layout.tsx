import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://trace.intelligence.dev"),
  title: {
    default: "TRACE — The X-ray for the Web | Website Intelligence & Architectural Audit",
    template: "%s | TRACE — By Teja Priyan",
  },
  description:
    "TRACE is an interactive website intelligence and architectural audit platform by Teja Priyan. Crawl any public website to visualize internal link graphs, inspect Core Web Vitals risks, audit security headers, reconstruct user journeys, and fingerprint tech stacks.",
  applicationName: "TRACE",
  authors: [{ name: "Teja Priyan", url: "https://github.com/TejaPriyan" }],
  generator: "Next.js",
  keywords: [
    "website intelligence",
    "site architecture visualization",
    "web crawler",
    "seo audit tool",
    "technical seo",
    "core web vitals analyzer",
    "security headers generator",
    "technology stack detector",
    "d3 graph visualizer",
    "page xray",
    "teja priyan",
  ],
  referrer: "origin-when-cross-origin",
  creator: "Teja Priyan",
  publisher: "Teja Priyan",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  verification: {
    google: "google2af4e1ed3191321d",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://trace.intelligence.dev",
    siteName: "TRACE",
    title: "TRACE — The X-ray for the Web",
    description:
      "Enter any public website and explore its structure, content, relationships, technologies, journeys, and signals through an interactive map.",
  },
  twitter: {
    card: "summary_large_image",
    title: "TRACE — The X-ray for the Web",
    description:
      "Enter any public website and explore its structure, content, relationships, technologies, journeys, and signals through an interactive map.",
    creator: "@TejaPriyan",
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  width: "device-width",
  initialScale: 1,
};

const themeScript = `try{var t=localStorage.getItem('trace.theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}`;

// Schema.org JSON-LD for AEO (Answer Engine Optimization) & GEO (Generative Engine Optimization)
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "name": "TRACE",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "All",
      "browserRequirements": "Requires JavaScript",
      "description":
        "The X-ray for the Web: an interactive website intelligence platform that crawls public websites, analyzes technology stacks, scores SEO and security signals, and visualizes architecture via interactive D3 graph layouts.",
      "url": "https://trace.intelligence.dev",
      "author": {
        "@type": "Person",
        "name": "Teja Priyan",
        "url": "https://github.com/TejaPriyan",
      },
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD",
      },
      "featureList": [
        "Interactive Force-Directed & Hierarchy Architecture Map",
        "Page X-Ray DOM & Metadata Inspector",
        "Core Web Vitals Performance Risk Matrix (LCP, CLS, INP)",
        "One-Click Security Header Hardening Config Generator",
        "SERP & Social Card Live Mockup Previews",
        "Technology Stack Fingerprinting with Confidence Ratings",
        "Automated User Journey Flow Reconstruction",
        "Side-by-Side Website Comparison Engine",
      ],
    },
    {
      "@type": "WebSite",
      "name": "TRACE",
      "url": "https://trace.intelligence.dev",
      "description": "The X-ray for the web — Website intelligence, architectural mapping, and technical audits.",
      "author": {
        "@type": "Person",
        "name": "Teja Priyan",
      },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  );
}

