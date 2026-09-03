import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

import { SITE_URL } from "../../../../lib/siteUrl";
const KEY = process.env.INDEXNOW_KEY;

// POST /api/admin/indexnow — push every published page URL to IndexNow, which
// instantly notifies Bing, Yandex, and other participating engines to crawl
// them. One call submits the whole batch (IndexNow allows up to 10,000 URLs).
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!KEY) return NextResponse.json({ error: "INDEXNOW_KEY is not configured" }, { status: 500 });

  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select sv.slug as service, lower(s.abbreviation) as state, lower(replace(c.name,' ','-')) as city
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where p.status = 'published'
       order by 1,2,3`
    );
    const seg = (x) => encodeURIComponent(x).replace(/'/g, "%27");
    const urlList = [
      SITE_URL,
      ...rows.map((r) => `${SITE_URL}/${seg(r.service)}/${seg(r.state)}/${seg(r.city)}`),
    ];

    const host = new URL(SITE_URL).host;
    const res = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: KEY,
        keyLocation: `${SITE_URL}/${KEY}.txt`,
        urlList,
      }),
    });

    // IndexNow returns 200/202 on success; surface the status either way.
    return NextResponse.json({
      submitted: urlList.length,
      indexnow_status: res.status,
      ok: res.ok,
    });
  } catch {
    return NextResponse.json({ error: "Submission failed" }, { status: 503 });
  }
}
