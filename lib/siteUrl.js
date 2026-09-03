// Single source of truth for the canonical site origin.
// Defaults to the production domain so that even if NEXT_PUBLIC_SITE_URL is
// ever unset (e.g. a misconfigured env on a new deploy), canonical tags, the
// sitemap, and structured data still point at the correct hostname instead
// of the internal Vercel domain.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://scherztruckinginc.com").replace(/\/$/, "");
