import { getPool } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

import { SITE_URL } from "../../../../lib/siteUrl";

// GET — CSV of every landing-page URL this tenant owns, for their ad manager
// to build campaigns/ad groups from. Columns: city, state, url.
export async function GET(request) {
  try {
    const email = await getAuthedEmail(request);
    if (!email) return new Response("Unauthorized", { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return new Response("No tenant account for this login", { status: 403 });

    const { rows } = await pool.query(
      `select c.name as city, s.abbreviation as state,
              sv.slug as service, lower(s.abbreviation) as st,
              lower(replace(c.name, ' ', '-')) as slug
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where p.tenant_id = $1 and p.status = 'published'
       order by s.abbreviation, c.name`,
      [tenant.id]
    );
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["city,state,url"].concat(
      rows.map((r) => [esc(r.city), esc(r.state), esc(`${SITE_URL}/${r.service}/${r.st}/${encodeURIComponent(r.slug)}`)].join(","))
    );
    return new Response(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="landing-pages-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch {
    return new Response("Database unavailable", { status: 503 });
  }
}
