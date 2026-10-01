import type { Confidence, DomainCategory, TechCategory, TechHit } from "./types";

interface Rule {
  name: string;
  cat: TechCategory;
  conf: Confidence;
  signal: string;
  src?: RegExp; // matches against resource URLs (script/link/img/iframe)
  html?: RegExp; // matches raw HTML
  hdr?: RegExp; // matches "name: value" header lines
}

const R = (name: string, cat: TechCategory, conf: Confidence, signal: string, m: Partial<Pick<Rule, "src" | "html" | "hdr">>): Rule => ({
  name,
  cat,
  conf,
  signal,
  ...m,
});

const RULES: Rule[] = [
  // Frameworks
  R("Next.js", "Framework", "High", "Next.js-specific resource patterns", { src: /\/_next\/static\//i, html: /__NEXT_DATA__|id="__next"/ }),
  R("Next.js", "Framework", "Medium", "x-powered-by header", { hdr: /^x-powered-by: next\.js/im }),
  R("React", "Framework", "Medium", "React markers in markup or bundles", { html: /data-reactroot|__reactContainer|data-react-helmet|react-root/i, src: /react(?:-dom)?(?:\.production)?(?:\.min)?\.js/i }),
  R("Nuxt", "Framework", "High", "Nuxt-specific resource patterns", { src: /\/_nuxt\//i, html: /window\.__NUXT__|id="__nuxt"/ }),
  R("Vue.js", "Framework", "Medium", "Vue markers or bundle", { html: /\sdata-v-[0-9a-f]{6,8}[\s=>]|data-server-rendered="true"|id="app"[^>]*data-v-app/i, src: /vue(?:\.runtime)?(?:\.global)?(?:\.prod)?(?:\.min)?\.js/i }),
  R("Angular", "Framework", "High", "ng-version attribute", { html: /\sng-version="[\d.]+"/ }),
  R("AngularJS", "Framework", "Medium", "ng-app directive", { html: /\sng-app[=\s>]/ }),
  R("Svelte / SvelteKit", "Framework", "Medium", "Svelte class or bundle markers", { src: /\/_app\/immutable\//i, html: /class="[^"]*\bsvelte-[a-z0-9]{5,}/i }),
  R("Gatsby", "Framework", "High", "Gatsby root element", { html: /id="___gatsby"/, src: /\/page-data\/|gatsby/i }),
  R("Astro", "Framework", "High", "Astro island or asset path", { html: /<astro-island|astro-[a-z0-9]{6,8}/i, src: /\/_astro\//i }),
  R("Remix", "Framework", "Medium", "Remix context object", { html: /window\.__remixContext/ }),
  R("jQuery", "Framework", "Medium", "jQuery script reference", { src: /jquery(?:[-.]\d[\d.]*)?(?:\.min)?\.js/i }),
  R("Bootstrap", "Framework", "Medium", "Bootstrap CSS/JS reference", { src: /bootstrap(?:\.bundle)?(?:\.min)?\.(?:css|js)|bootstrap@/i }),
  R("Tailwind CSS", "Framework", "Low", "Tailwind CDN or utility class density", { src: /cdn\.tailwindcss\.com/i }),
  R("Docusaurus", "Framework", "High", "Docusaurus generator", { html: /<meta name="generator" content="Docusaurus/i }),
  R("VitePress", "Framework", "High", "VitePress markers", { html: /VPContent|vitepress/i }),
  R("MkDocs", "Framework", "High", "MkDocs generator", { html: /<meta name="generator" content="mkdocs/i }),
  R("Hugo", "Framework", "High", "Hugo generator", { html: /<meta name="generator" content="Hugo/i }),
  R("Jekyll", "Framework", "High", "Jekyll generator", { html: /<meta name="generator" content="Jekyll/i }),
  R("Eleventy", "Framework", "High", "Eleventy generator", { html: /<meta name="generator" content="Eleventy/i }),
  R("Laravel", "Framework", "Medium", "Laravel session cookie", { hdr: /^set-cookie: .*laravel_session/im }),
  R("Express", "Framework", "Medium", "x-powered-by header", { hdr: /^x-powered-by: express/im }),
  R("PHP", "Framework", "Medium", "x-powered-by header", { hdr: /^x-powered-by: php/im }),
  R("ASP.NET", "Framework", "Medium", "ASP.NET headers", { hdr: /^x-aspnet-version|^x-powered-by: asp\.net/im }),
  R("Ruby on Rails", "Framework", "Medium", "Rails CSRF meta / headers", { html: /<meta name="csrf-param" content="authenticity_token"/i }),
  // CMS
  R("WordPress", "CMS", "High", "wp-content / wp-json paths", { src: /\/wp-content\/|\/wp-includes\//i, html: /<meta name="generator" content="WordPress/i }),
  R("Shopify", "CMS", "High", "Shopify CDN and theme objects", { src: /cdn\.shopify\.com/i, html: /Shopify\.theme|shopify-digital-wallet/i, hdr: /^x-shopid:|^x-shardid:/im }),
  R("Webflow", "CMS", "High", "Webflow data attributes", { html: /data-wf-(?:page|site)=|<meta content="Webflow"/i, src: /assets\.website-files\.com|webflow\.com/i }),
  R("Wix", "CMS", "High", "Wix static assets", { src: /static\.wixstatic\.com|parastorage\.com/i, html: /<meta name="generator" content="Wix/i }),
  R("Squarespace", "CMS", "High", "Squarespace assets", { src: /static1\.squarespace\.com|squarespace-cdn\.com/i, html: /Squarespace/i }),
  R("Ghost", "CMS", "High", "Ghost generator", { html: /<meta name="generator" content="Ghost/i }),
  R("Drupal", "CMS", "High", "Drupal generator or settings", { html: /<meta name="generator" content="Drupal|drupal-settings-json/i, hdr: /^x-drupal-cache|^x-generator: drupal/im }),
  R("Joomla", "CMS", "Medium", "Joomla generator", { html: /<meta name="generator" content="Joomla/i }),
  R("Framer", "CMS", "High", "Framer generator", { html: /<meta name="generator" content="Framer/i, src: /framerusercontent\.com/i }),
  R("Contentful", "CMS", "Low", "Contentful asset domain", { src: /images\.ctfassets\.net/i }),
  R("Sanity", "CMS", "Low", "Sanity CDN reference", { src: /cdn\.sanity\.io/i }),
  // Hosting / CDN / Server
  R("Vercel", "Hosting", "High", "Vercel response headers", { hdr: /^server: vercel|^x-vercel-id:/im }),
  R("Netlify", "Hosting", "High", "Netlify response headers", { hdr: /^server: netlify|^x-nf-request-id:/im }),
  R("GitHub Pages", "Hosting", "High", "GitHub.com server header", { hdr: /^server: github\.com/im }),
  R("Cloudflare Pages", "Hosting", "Medium", "pages.dev hostname", { src: /\.pages\.dev\//i }),
  R("AWS S3", "Hosting", "Medium", "AmazonS3 server header", { hdr: /^server: amazons3/im }),
  R("Heroku", "Hosting", "Low", "Heroku via header", { hdr: /^via: .*vegur/im }),
  R("Cloudflare", "CDN", "High", "Cloudflare response headers", { hdr: /^server: cloudflare|^cf-ray:/im }),
  R("Fastly", "CDN", "High", "Fastly response headers", { hdr: /^x-served-by: cache-|^x-fastly-request-id:|^fastly-debug/im }),
  R("Amazon CloudFront", "CDN", "High", "CloudFront response headers", { hdr: /^x-amz-cf-id:|^via: .*cloudfront/im }),
  R("Akamai", "CDN", "Medium", "Akamai headers", { hdr: /^server: akamaighost|^x-akamai-/im }),
  R("jsDelivr", "CDN", "Medium", "cdn.jsdelivr.net resources", { src: /cdn\.jsdelivr\.net/i }),
  R("cdnjs", "CDN", "Medium", "cdnjs.cloudflare.com resources", { src: /cdnjs\.cloudflare\.com/i }),
  R("unpkg", "CDN", "Medium", "unpkg.com resources", { src: /unpkg\.com/i }),
  R("nginx", "Server", "Medium", "Server header", { hdr: /^server: nginx/im }),
  R("Apache", "Server", "Medium", "Server header", { hdr: /^server: apache/im }),
  R("Microsoft IIS", "Server", "Medium", "Server header", { hdr: /^server: microsoft-iis/im }),
  R("LiteSpeed", "Server", "Medium", "Server header", { hdr: /^server: litespeed/im }),
  // Analytics
  R("Google Analytics", "Analytics", "High", "Google Analytics script/endpoint", { src: /google-analytics\.com|googletagmanager\.com\/gtag\/js|analytics\.google\.com/i, html: /gtag\('config'|ga\('create'/ }),
  R("Google Tag Manager", "Analytics", "High", "GTM container script", { src: /googletagmanager\.com\/gtm\.js/i, html: /GTM-[A-Z0-9]{4,8}/ }),
  R("Plausible", "Analytics", "High", "Plausible script", { src: /plausible\.io\/js/i }),
  R("Fathom", "Analytics", "High", "Fathom script", { src: /cdn\.usefathom\.com/i }),
  R("Matomo", "Analytics", "High", "Matomo tracker", { src: /matomo\.js|piwik\.js/i, html: /_paq\.push/ }),
  R("Hotjar", "Analytics", "High", "Hotjar script", { src: /static\.hotjar\.com|hotjar\.com/i }),
  R("Segment", "Analytics", "High", "Segment analytics.js", { src: /cdn\.segment\.com|segment\.io/i }),
  R("Mixpanel", "Analytics", "High", "Mixpanel library", { src: /mixpanel\.com|cdn\.mxpnl\.com/i }),
  R("Amplitude", "Analytics", "High", "Amplitude SDK", { src: /amplitude\.com|cdn\.amplitude/i }),
  R("PostHog", "Analytics", "High", "PostHog snippet", { src: /posthog\.com|i\.posthog/i, html: /posthog\.init/ }),
  R("Meta Pixel", "Analytics", "High", "Facebook pixel script", { src: /connect\.facebook\.net\/[^"']*fbevents\.js/i, html: /fbq\('init'/ }),
  R("LinkedIn Insight", "Analytics", "High", "LinkedIn insight tag", { src: /snap\.licdn\.com/i }),
  R("Microsoft Clarity", "Analytics", "High", "Clarity script", { src: /clarity\.ms/i }),
  R("Vercel Analytics", "Analytics", "High", "Vercel insights script", { src: /\/_vercel\/(?:insights|speed-insights)/i }),
  R("Heap", "Analytics", "High", "Heap script", { src: /heap-?analytics|heapanalytics\.com/i }),
  R("Sentry", "Other", "High", "Sentry SDK", { src: /sentry-cdn\.com|browser\.sentry|sentry\.io/i }),
  // Payment
  R("Stripe", "Payment", "High", "Stripe.js reference", { src: /js\.stripe\.com|checkout\.stripe\.com/i }),
  R("PayPal", "Payment", "High", "PayPal SDK/link", { src: /paypal\.com\/sdk|paypalobjects\.com/i }),
  R("Square", "Payment", "Medium", "Square payments script", { src: /squareup\.com|web\.squarecdn\.com/i }),
  R("Braintree", "Payment", "High", "Braintree client", { src: /braintreegateway\.com|js\.braintreegateway/i }),
  R("Klarna", "Payment", "Medium", "Klarna script", { src: /klarna\.com|klarnacdn\.net/i }),
  R("Adyen", "Payment", "Medium", "Adyen checkout", { src: /adyen\.com|checkoutshopper-live/i }),
  R("Paddle", "Payment", "Medium", "Paddle script", { src: /paddle\.com/i }),
  R("Lemon Squeezy", "Payment", "Medium", "Lemon Squeezy reference", { src: /lemonsqueezy\.com|lmsqueezy\.com/i }),
  // Fonts
  R("Google Fonts", "Font", "High", "fonts.googleapis.com stylesheet", { src: /fonts\.googleapis\.com|fonts\.gstatic\.com/i }),
  R("Adobe Fonts", "Font", "High", "Typekit script/stylesheet", { src: /use\.typekit\.net|fonts\.adobe\.com/i }),
  R("Font Awesome", "Font", "Medium", "Font Awesome reference", { src: /fontawesome|font-awesome/i }),
  // Other services
  R("Intercom", "Other", "High", "Intercom widget", { src: /widget\.intercom\.io|js\.intercomcdn\.com/i }),
  R("Drift", "Other", "High", "Drift widget", { src: /js\.driftt\.com|drift\.com/i }),
  R("Zendesk", "Other", "High", "Zendesk widget", { src: /zdassets\.com|zendesk\.com/i }),
  R("HubSpot", "Other", "High", "HubSpot scripts", { src: /js\.hs-scripts\.com|hsforms\.net|hs-analytics\.net|hubspot\.com/i }),
  R("Mailchimp", "Other", "High", "Mailchimp embed", { src: /chimpstatic\.com|list-manage\.com|mailchimp\.com/i }),
  R("Crisp", "Other", "High", "Crisp chat", { src: /client\.crisp\.chat/i }),
  R("reCAPTCHA", "Other", "High", "Google reCAPTCHA", { src: /google\.com\/recaptcha|gstatic\.com\/recaptcha/i }),
  R("hCaptcha", "Other", "High", "hCaptcha", { src: /hcaptcha\.com/i }),
  R("Cloudflare Turnstile", "Other", "High", "Turnstile script", { src: /challenges\.cloudflare\.com\/turnstile/i }),
  R("YouTube embed", "Other", "High", "YouTube iframe/player", { src: /youtube(?:-nocookie)?\.com\/embed|youtube\.com\/iframe_api/i }),
  R("Vimeo", "Other", "High", "Vimeo player", { src: /player\.vimeo\.com/i }),
  R("Calendly", "Other", "High", "Calendly embed", { src: /calendly\.com/i }),
  R("Typeform", "Other", "High", "Typeform embed", { src: /typeform\.com/i }),
  R("Disqus", "Other", "High", "Disqus embed", { src: /disqus\.com/i }),
  R("Algolia", "Other", "Medium", "Algolia client", { src: /algolia\.net|algolianet\.com|algolia\.com/i }),
  R("Google Maps", "Other", "High", "Google Maps embed/API", { src: /maps\.googleapis\.com|google\.com\/maps\/embed/i }),
  R("Auth0", "Other", "Medium", "Auth0 SDK", { src: /auth0\.com/i }),
  R("Cookiebot / consent manager", "Other", "Medium", "Consent management script", { src: /cookiebot\.com|cookielaw\.org|onetrust\.com|osano\.com|iubenda\.com/i }),
];

export interface TechContext {
  html: string;
  urls: string[];
  headers: Record<string, string>;
}

function snippet(s: string): string {
  return s.replace(/\s+/g, " ").slice(0, 110);
}

export function detectTech(ctx: TechContext): TechHit[] {
  const hdr = Object.entries(ctx.headers)
    .filter(([k]) => /^(server|x-|via|cf-|fastly|set-cookie|content-security|strict)/i.test(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const urlBlob = ctx.urls.join("\n");
  const hits: TechHit[] = [];
  const seen = new Set<string>();
  for (const r of RULES) {
    let evidence: string | null = null;
    let where = "";
    if (r.src) {
      const m = r.src.exec(urlBlob);
      if (m) {
        const line = urlBlob.split("\n").find((l) => r.src!.test(l));
        evidence = `Resource reference: ${snippet(line ?? m[0])}`;
        where = "resource";
      }
    }
    if (!evidence && r.hdr) {
      const m = r.hdr.exec(hdr);
      if (m) {
        evidence = `Response header: ${snippet(m[0])}`;
        where = "header";
      }
    }
    if (!evidence && r.html) {
      const m = r.html.exec(ctx.html);
      if (m) {
        evidence = `HTML marker: ${snippet(m[0])}`;
        where = "html";
      }
    }
    if (evidence) {
      const key = r.name + "|" + r.signal;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ name: r.name, category: r.cat, confidence: r.conf, signal: r.signal + (where ? ` (${where})` : ""), evidence });
    }
  }
  return hits;
}

// ---- External domain categorisation ----
const DOMAIN_RULES: [RegExp, DomainCategory][] = [
  [/(google-analytics|googletagmanager|analytics\.google|plausible\.io|hotjar|segment\.(com|io)|mixpanel|amplitude|posthog|clarity\.ms|fathom|matomo|heap|doubleclick|googlesyndication|hs-analytics|licdn\.com|sentry)/i, "Analytics"],
  [/(facebook|fb\.com|instagram|twitter|(^|\.)x\.com$|linkedin|tiktok|pinterest|reddit|threads\.net|mastodon|discord|t\.me|whatsapp|snapchat)/i, "Social"],
  [/(stripe|paypal|paypalobjects|squareup|braintree|klarna|adyen|paddle|lemonsqueezy|shop\.app)/i, "Payment"],
  [/(fonts\.googleapis|fonts\.gstatic|typekit|fonts\.adobe|fontawesome|use\.fontawesome)/i, "Fonts"],
  [/(cloudflare|cloudfront|fastly|akamai|jsdelivr|unpkg|cdnjs|cdn\.|bootstrapcdn|azureedge|googleapis\.com|gstatic\.com|b-cdn|stackpath|vercel-storage)/i, "CDN"],
  [/(youtube|youtu\.be|vimeo|giphy|unsplash|pexels|flickr|spotify|soundcloud|twitch|imgur|ytimg|cloudinary|imgix|ctfassets|wixstatic)/i, "Media"],
];

export function categorizeDomain(domain: string, kinds: string[]): DomainCategory {
  for (const [re, cat] of DOMAIN_RULES) if (re.test(domain)) return cat;
  const resourceLike = kinds.some((k) => ["script", "style", "image", "font", "iframe", "preconnect", "media"].includes(k));
  return resourceLike ? "External resource" : "Unknown";
}
