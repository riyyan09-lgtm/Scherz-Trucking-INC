/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'export', // disabled - static export fails on API routes
  outputDirectory: 'public',
  // Static generation of the 500+ landing pages is memory-heavy. Cap the
  // worker pool so peak RSS stays low on constrained build hosts (and local
  // dev machines with little free RAM). Vercel has ample memory, but this is
  // a safe, deterministic default.
  experimental: {
    cpus: 1,
    workerThreads: false,
    // The lead-import route reads pdfjs-dist's standard_fonts, and
    // pdfjs-dist itself dynamic-imports its own pdf.worker.mjs relative to
    // its own file location ("fake worker" fallback, since there's no real
    // Worker thread in a serverless function) -- both are runtime-resolved
    // paths, not static imports, so Vercel's file tracer won't pick them up
    // on its own. Without this, PDF import works locally (full node_modules
    // tree present) but 400s once deployed ("Cannot find module
    // .../pdf.worker.mjs" / font ENOENT).
    // Key must be the normalizeAppPath() form Next actually matches against
    // ("/app/<route>", no trailing "/route") -- verified against
    // node_modules/next/dist/build/collect-build-traces.js locally; the
    // more intuitive "/api/.../route" key silently matches nothing.
    // @sparticuz/chromium extracts its Chromium binary from its own
    // package directory (bin/*.tar.br) via a runtime-computed path, same
    // "not a static import" class of problem as pdfjs's worker/fonts above
    // -- included defensively so a first-deploy test isn't wasted finding
    // this out the hard way again.
    outputFileTracingIncludes: {
      "/app/api/portal/lead-management/import": [
        "node_modules/pdfjs-dist/standard_fonts/**",
        "node_modules/pdfjs-dist/legacy/build/**",
      ],
      // Every route that can call lib/htmlInvoice.js's renderHtmlToPdf().
      "/app/api/crm/invoice/generate": ["node_modules/@sparticuz/chromium/bin/**"],
      "/app/api/admin/tenants/[id]/invoice-template/preview-html": ["node_modules/@sparticuz/chromium/bin/**"],
    },
    // pdfjs-dist and @sparticuz/chromium/puppeteer-core all resolve files
    // relative to their own package location at runtime; webpack-bundling
    // them breaks those relative lookups. Keeping them external lets
    // Node's own require/import resolve them normally from node_modules.
    serverComponentsExternalPackages: ["pdfjs-dist", "puppeteer-core", "@sparticuz/chromium"],
  },
  // The app is also reachable at the raw Vercel domain, which was fully
  // serving every page (200, no redirect) alongside the canonical
  // scherztruckinginc.com — Google was crawling both, splitting/diluting crawl
  // budget and signals across two hostnames for the same 2000+ pages even
  // though canonical tags pointed at scherztruckinginc.com. Redirect the Vercel
  // domain to the canonical one so only one hostname is ever actually
  // fetched and indexed.
  //
  // /api is deliberately excluded: a page already open on the vercel.app
  // origin (an old tab, a stale bookmark) makes same-origin fetch("/api/...")
  // calls against that origin. Redirecting those cross-origin to
  // scherztruckinginc.com turned every login/session call into a cross-origin
  // fetch with no CORS allowance, which the browser blocked outright
  // ("Failed to fetch" / "Service temporarily unreachable"). Only page
  // navigations need the canonical-domain redirect for SEO; API calls work
  // identically on either host since it's the same app/database.
  async redirects() {
    return [
      // The first cut of the service pages briefly shipped at these flat
      // URLs before being rebuilt under /services/<slug> (one template for
      // all 8 services). They were live long enough to be crawled or
      // bookmarked, so point each at its direct equivalent rather than the
      // homepage — a 301 to the matching page keeps whatever link equity and
      // user intent the old URL had.
      { source: "/open-transport", destination: "/services/open-car-transport", permanent: true },
      { source: "/enclosed-transport", destination: "/services/enclosed-car-transport", permanent: true },
      { source: "/door-to-door-delivery", destination: "/services/door-to-door-shipping", permanent: true },
      // The bare /car-shipping hub had no page and 404'd. It's the umbrella
      // service, so point it at the matching /services/car-shipping page
      // (the same convention as the /open-transport -> /services/... redirect
      // above) rather than letting it duplicate the city/segment routes.
      { source: "/car-shipping", destination: "/services/car-shipping", permanent: true },
      {
        source: "/:path((?!api).*)",
        has: [{ type: "host", value: "scherz-trucking-app.vercel.app" }],
        destination: "https://scherztruckinginc.com/:path",
        permanent: true,
      },
      // Collapse the http(s)://www.scherztruckinginc.com -> https://scherztruckinginc.com
      // hop into a single 308 (otherwise http www becomes a 2-hop chain:
      // http www -> https www -> https non-www, which GSC flags as a
      // multi-hop redirect). Catches both schemes via the host matcher.
      {
        source: "/:path((?!api).*)",
        has: [{ type: "host", value: "www.scherztruckinginc.com" }],
        destination: "https://scherztruckinginc.com/:path",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
