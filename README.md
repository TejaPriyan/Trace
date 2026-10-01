# TRACE — The X-ray for the Web

<p align="center">
  <strong>Interactive Website Intelligence, Architectural Visualization, and Technical Audit Platform</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.2.6-black?style=for-the-badge&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/React-19.2.6-blue?style=for-the-badge&logo=react" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.9.3-blue?style=for-the-badge&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?style=for-the-badge&logo=tailwind-css" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Turbopack-Enabled-orange?style=for-the-badge" alt="Turbopack" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
</p>

---

## 🔍 Overview

**TRACE** is a high-performance website intelligence platform created by **Teja Priyan**. Instead of treating websites as flat lists of URLs, TRACE crawls any public website and reconstructs its entire structure into a living, interactive architectural graph. 

It audits technical SEO, tracks Core Web Vitals risks, checks security headers, reconstructs user journeys, maps third-party dependencies, and fingerprints technologies—all in one responsive workspace.

---

## ✨ Key Features

- **🌐 Interactive Architecture Map (`MapView`):**
  - **4 Dynamic Layouts:** Hierarchy (Tree), Force-Directed Physics (D3), Radial, and Section Clusters.
  - **Color Modes:** Color nodes by *Inferred Section*, *HTTP Health Status* (200 / 3xx / 4xx), or *Crawl Depth*.
  - **Size Modes:** Scale node radius by *Default*, *Inbound Link Popularity*, or *Word Count*.
  - **Export:** Instant SVG and PNG download of the full architecture graph.

- **🔬 Page X-Ray (`PageXray`):**
  - Deep slide-out inspector for every single crawled page.
  - Heading hierarchy tree (H1–H6), forms, inputs, scripts, and asset breakdown.
  - **Live Search & Social Card Previews:** Real-time preview of how any page renders on **Google SERP**, **Twitter / X Large Cards**, and **LinkedIn**, with character count safety gauges.

- **⚡ Core Web Vitals (CWV) Risk Matrix:**
  - Evaluates **LCP Risk** (server TTFB & heavy document payloads).
  - Evaluates **CLS Risk** (unconstrained images missing explicit `width`/`height`).
  - Evaluates **INP / TBT Risk** (render-blocking `<script>` tags in `<head>`).

- **🛡️ Security Header Hardening Generator:**
  - Audits HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.
  - One-click copyable config generation for **Next.js (`next.config.ts`)**, **Nginx**, **Cloudflare Pages (`_headers`)**, and **Apache (`.htaccess`)**.

- **🧪 Technology Stack Fingerprinting:**
  - Identifies frameworks (Next.js, React, Vue, WordPress), hosting providers (Vercel, Cloudflare, AWS), analytics (GTM, Segment, PostHog), payment gateways (Stripe), and fonts with confidence scoring and exact HTML/header evidence.

- **🗺️ User Journey Flow Reconstruction:**
  - Automatically reconstructs common user flows (Onboarding, Signup, Checkout, Documentation) based on navigation patterns, anchor semantics, and form submissions.

- **⚖️ Side-by-Side Website Comparison Engine (`/compare`):**
  - Compare two websites or snapshots side-by-side with 1-click presets (`Demo vs example.com`, `Stripe vs Lemon Squeezy`, `Vercel vs Netlify`).
  - Features a dedicated **Technology Stack Overlap Matrix** showing shared vs. distinct technologies.

- **💾 Dual-Mode Storage Architecture:**
  - **Zero-Setup In-Memory Store:** Works out of the box with zero external dependencies.
  - **PostgreSQL Persistence (Optional):** Automatically connects to PostgreSQL via Drizzle ORM when `DATABASE_URL` is set.

---

## 🛠️ Architecture & Pipeline

```
[Target URL]
     │
     ▼
[Security & DNS Resolver]  ──► Validates public DNS; blocks private/internal IP ranges (SSRF protection)
     │
     ▼
[Polite Crawler Engine]    ──► Honors robots.txt; respects concurrency & request limits; streams live crawl progress
     │
     ▼
[DOM & AST Parser]         ──► Cheerio extraction: meta tags, OpenGraph, JSON-LD, links, headers, forms, assets
     │
     ▼
[Analysis Engines]         ──► Tech detection, health scoring, journey reconstruction, CWV risk estimation
     │
     ▼
[Graph Layout Engine]      ──► D3-force & hierarchical graph layouts (radial, tree, force-directed)
     │
     ▼
[Workspace UI]             ──► Reactive dashboard with 10 specialized views & Page X-Ray inspector
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js:** v18.18.0 or higher (v20+ recommended)
- **npm** or **pnpm** or **yarn**

### Installation

```bash
# Clone the repository
git clone https://github.com/TejaPriyan/Trace.git
cd Trace

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚙️ Configuration (Optional)

TRACE is fully functional without any database. If you wish to enable persistent storage across restarts, configure PostgreSQL:

Create a `.env.local` file in the root directory:

```env
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/trace_db
```

Push schema migrations:

```bash
npx drizzle-kit push
```

---

## 📦 Scripts

| Script | Command | Description |
| :--- | :--- | :--- |
| `dev` | `npm run dev` | Starts the Next.js dev server with Turbopack |
| `build` | `npm run build` | Builds the optimized production application |
| `start` | `npm run start` | Runs the built production server |
| `typecheck` | `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`) |
| `lint` | `npm run lint` | Runs ESLint checks across codebase |

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.

---

## 👤 Author

**Teja Priyan**
- GitHub: [@TejaPriyan](https://github.com/TejaPriyan)
- Email: [teja1616150@gmail.com](mailto:teja1616150@gmail.com)
