import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// GET — page counts by service and status, so the admin can see what's live
// and what's paused (freight/container are held back by default).
export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select sv.slug as service, sv.name as service_name, p.status, count(*)::int as n
       from pages p join services sv on p.service_id = sv.id
       group by sv.slug, sv.name, p.status
       order by sv.name`
    );
    const byService = {};
    for (const r of rows) {
      byService[r.service] = byService[r.service] || { service: r.service, name: r.service_name, published: 0, paused: 0, draft: 0 };
      byService[r.service][r.status] = (byService[r.service][r.status] || 0) + r.n;
    }
    return NextResponse.json({ services: Object.values(byService) });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST { service, action: 'publish' | 'pause' } — bulk publish or pause every
// page for a service. Publishing paused freight/container pages, or pausing a
// service, is a one-click operation. Redeploy afterward to refresh the ISR
// cache + sitemap (handled by the caller's guidance).
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = body?.action;
  const service = body?.service;
  if (!["publish", "pause"].includes(action) || !service) {
    return NextResponse.json({ error: "Provide service and action (publish|pause)" }, { status: 400 });
  }
  try {
    const pool = getPool();
    const from = action === "publish" ? "paused" : "published";
    const to = action === "publish" ? "published" : "paused";
    const upd = await pool.query(
      `update pages p set status = $1, published_at = case when $1 = 'published' then now() else published_at end
       from services sv
       where p.service_id = sv.id and sv.slug = $2 and p.status = $3
       returning p.id`,
      [to, service, from]
    );
    return NextResponse.json({ success: true, changed: upd.rows.length });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
