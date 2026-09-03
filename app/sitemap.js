import { getPool } from "../lib/db";

// Regenerated frequently so newly added city pages enter the sitemap
// (and thus search engines) within minutes, not an hour.
export const revalidate = 300;

import { SITE_URL } from "../lib/siteUrl";

// Encode a URL path segment so it's a valid sitemap <loc>. encodeURIComponent
// leaves apostrophes raw, which breaks the sitemap spec (Coeur d'Alene,
// O'Fallon, Lee's Summit), so escape those explicitly.
function seg(s) {
  return encodeURIComponent(s).replace(/'/g, "%27");
}

export default async function sitemap() {
  const home = { url: SITE_URL, changeFrequency: "daily", priority: 1 };
  const calculator = {
    url: `${SITE_URL}/car-shipping-cost-calculator`,
    changeFrequency: "monthly",
    priority: 0.9,
  };
  const SERVICES = [
    { slug: "car-shipping", priority: 0.85 },
    { slug: "open-car-transport", priority: 0.8 },
    { slug: "enclosed-car-transport", priority: 0.8 },
    { slug: "motorcycle-transport", priority: 0.8 },
    { slug: "door-to-door-car-shipping", priority: 0.8 },
    { slug: "terminal-to-terminal-car-shipping", priority: 0.8 },
    { slug: "snowbird-car-shipping", priority: 0.75 },
    { slug: "military-car-shipping", priority: 0.75 },
    { slug: "college-student-car-shipping", priority: 0.7 },
    { slug: "classic-car-transport", priority: 0.7 },
  ];
  const LOCATIONS = { url: `${SITE_URL}/locations`, changeFrequency: "monthly", priority: 0.85 };
  const SEGMENTS = [
    { slug: "dealers", priority: 0.8 },
    { slug: "repair-shops", priority: 0.8 },
    { slug: "fleet", priority: 0.8 },
    { slug: "auctions", priority: 0.8 },
    { slug: "manufacturers", priority: 0.75 },
    { slug: "marketplaces", priority: 0.75 },
    { slug: "relocation", priority: 0.75 },
  ];
  const staticPages = [
    home,
    calculator,
    LOCATIONS,
    ...SERVICES.map((s) => ({ url: `${SITE_URL}/services/${s.slug}`, changeFrequency: "monthly", priority: s.priority })),
    ...SEGMENTS.map((seg) => ({ url: `${SITE_URL}/car-shipping/${seg.slug}`, changeFrequency: "monthly", priority: seg.priority })),
  ];
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select sv.slug as service, lower(s.abbreviation) as state, lower(replace(c.name,' ','-')) as city,
              greatest(p.last_generated_at, p.published_at, p.created_at) as modified
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where p.status = 'published'
       order by 1, 2, 3`
    );
    return [
      ...staticPages,
      ...rows.map((r) => ({
        url: `${SITE_URL}/${seg(r.service)}/${seg(r.state)}/${seg(r.city)}`,
        lastModified: r.modified || undefined,
        changeFrequency: "weekly",
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}
