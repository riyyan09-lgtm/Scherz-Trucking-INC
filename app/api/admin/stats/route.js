import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";

// Always compute fresh numbers -- this route backs a live dashboard.
export const dynamic = "force-dynamic";

// GET /api/admin/stats
// Backs the admin dashboard: real counts from the database.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pool = getPool();
    const [pages, leads, tenants, queue, topPages, recentLeads] = await Promise.all([
      pool.query(
        `select count(*) filter (where status = 'published') as published,
                count(*) as total
         from pages`
      ),
      pool.query(
        `select count(*) as total,
                count(*) filter (where created_at >= now() - interval '24 hours') as last_24h,
                count(distinct source_page_id) filter (where source_page_id is not null) as pages_with_leads
         from leads`
      ),
      pool.query(`select count(*) filter (where status = 'active') as active from tenants`),
      pool.query(
        `select id, action_type, target_table, target_id, reasoning, confidence
         from ai_action_queue
         where status = 'pending'
         order by created_at desc
         limit 10`
      ),
      pool.query(
        `select p.url_slug, count(l.id)::int as lead_count, max(l.created_at) as last_lead_at
         from leads l
         join pages p on l.source_page_id = p.id
         group by p.url_slug
         order by lead_count desc, last_lead_at desc
         limit 10`
      ),
      pool.query(
        `select l.id, l.name, l.phone, l.routing_mode, l.status, l.created_at, p.url_slug,
                l.origin_state, l.origin_zip, l.origin_city,
                l.destination_state, l.destination_zip, l.destination_city,
                l.pickup_date, l.vehicle_year, l.vehicle_make, l.vehicle_model, l.vehicles
         from leads l
         left join pages p on l.source_page_id = p.id
         order by l.created_at desc
         limit 10`
      ),
    ]);

    // Feedback aggregate is resilient: if the feedback table is missing
    // (e.g. mid-migration), fall back to zeros instead of taking the whole
    // dashboard offline. Refunds/chargebacks are tenant-side business data
    // (Payments tab, per tenant) and deliberately don't surface here.
    let feedback = { open: 0, total: 0 };
    try {
      const fb = await pool.query(`select count(*) filter (where status = 'new' or status = 'in_progress') as open, count(*) as total from feedback`);
      feedback = { open: Number(fb.rows[0].open), total: Number(fb.rows[0].total) };
    } catch { /* feedback table may not exist yet */ }

    return NextResponse.json({
      pagesPublished: Number(pages.rows[0].published),
      pagesTotal: Number(pages.rows[0].total),
      leadsTotal: Number(leads.rows[0].total),
      leadsLast24h: Number(leads.rows[0].last_24h),
      pagesWithLeads: Number(leads.rows[0].pages_with_leads),
      activeTenants: Number(tenants.rows[0].active),
      pendingActions: queue.rows,
      topPages: topPages.rows,
      recentLeads: recentLeads.rows,
      feedback,
    });
  } catch {
    // Database unreachable -- let the dashboard show a degraded state
    // instead of crashing (see CLAUDE.md conventions).
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
