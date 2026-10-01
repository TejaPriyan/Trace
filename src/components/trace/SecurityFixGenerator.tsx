"use client";
import { useState } from "react";
import { Btn, Label, cx } from "./ui";

type ServerTarget = "nextjs" | "nginx" | "cloudflare" | "apache";

const SNIPPETS: Record<ServerTarget, { name: string; file: string; code: string }> = {
  nextjs: {
    name: "Next.js",
    file: "next.config.ts",
    code: `import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https:;"
  }
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  }
};

export default nextConfig;`,
  },
  nginx: {
    name: "Nginx",
    file: "nginx.conf",
    code: `# Add inside server {} or location / {} block:
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;" always;`,
  },
  cloudflare: {
    name: "Cloudflare Pages",
    file: "_headers",
    code: `/*
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;`,
  },
  apache: {
    name: "Apache",
    file: ".htaccess",
    code: `<IfModule mod_headers.c>
  Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
</IfModule>`,
  },
};

export function SecurityFixGenerator() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<ServerTarget>("nextjs");
  const [copied, setCopied] = useState(false);

  const snippet = SNIPPETS[target];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  };

  return (
    <div className="border border-line bg-panel p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label className="text-accent">Security Header Hardening</Label>
          <p className="mt-1 text-xs text-mute">
            Protect against clickjacking, MIME sniffing, and insecure protocols with pre-configured security headers.
          </p>
        </div>
        <Btn variant="primary" onClick={() => setOpen(!open)}>
          {open ? "Hide generator" : "Generate config fix"}
        </Btn>
      </div>

      {open && (
        <div className="border border-line bg-bg p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
            <div className="flex flex-wrap gap-1">
              {(Object.keys(SNIPPETS) as ServerTarget[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setTarget(k)}
                  className={cx(
                    "border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition",
                    target === k
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line text-mute hover:text-fg"
                  )}
                >
                  {SNIPPETS[k].name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-dim">{snippet.file}</span>
              <Btn onClick={copy}>
                {copied ? "Copied! ✓" : "Copy snippet"}
              </Btn>
            </div>
          </div>

          <pre className="overflow-x-auto border border-line bg-panel p-3 font-mono text-xs leading-relaxed text-fg/90">
            <code>{snippet.code}</code>
          </pre>

          <div className="grid gap-2 sm:grid-cols-3 pt-2 text-[11px] text-mute">
            <div>
              <span className="font-mono font-medium text-fg">HSTS:</span> Enforces HTTPS exclusively for 2 years with preloading.
            </div>
            <div>
              <span className="font-mono font-medium text-fg">X-Frame-Options:</span> Blocks iframe embedding to eliminate clickjacking.
            </div>
            <div>
              <span className="font-mono font-medium text-fg">CSP:</span> Restricts origin execution to mitigate XSS vulnerabilities.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
