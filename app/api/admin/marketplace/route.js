import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// The marketplace is where overflow leads (routing_mode = 'marketplace') get
// listed for sale at a price and claimed by buyers (lead_marketplace_offers).

// GET /api/admin/marketplace — stats + offers + overflow leads not yet listed.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pool = getPool();
    const [stats, offers, unlisted] = await Promise.all([
      pool.query(
        `select
           count(*) filter (where o.status = 'open')::int as open_offers,
           count(*) filter (where o.status = 'claimed' and o.claimed_at >= date_trunc('month', now()))::int as claimed_month,
           coalesce(sum(o.price) filter (where o.status = 'claimed' and o.claimed_at >= date_trunc('month', now())), 0) as revenue_month
         from lead_marketplace_offers o`
      ),
      pool.query(
        `select o.id, o.price, o.status, o.offered_at, o.claimed_at,
                l.name as lead_name, l.origin_state, l.destination_state,
                a.name as claimed_by_name
         from lead_marketplace_offers o
         join leads l on o.lead_id = l.id
         left join agents a on o.claimed_by = a.id
         order by o.offered_at desc
         limit 50`
      ),
      pool.query(
        `select l.id, l.name, l.phone, l.overflow_reason, l.created_at,
                l.origin_city, l.origin_state, l.destination_city, l.destination_state,
                l.vehicle_year, l.vehicle_make, l.vehicle_model
         from leads l
         where l.routing_mode = 'marketplace'
           and not exists (select 1 from lead_marketplace_offers o where o.lead_id = l.id)
         order by l.created_at desc
         limit 50`
      ),
    ]);
    return NextResponse.json({
      openOffers: stats.rows[0].open_offers,
      claimedMonth: stats.rows[0].claimed_month,
      revenueMonth: Number(stats.rows[0].revenue_month),
      offers: offers.rows,
      unlisted: unlisted.rows,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/admin/marketplace — { lead_id, price } lists an overflow lead.
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leadId = Number(body?.lead_id);
  const price = Number(body?.price);
  if (!leadId || !(price > 0) || price > 100000) {
    return NextResponse.json({ error: "Provide lead_id and a positive price" }, { status: 400 });
  }
  try {
    const pool = getPool();
    const lead = await pool.query(
      `select id from leads where id = $1 and routing_mode = 'marketplace'
         and not exists (select 1 from lead_marketplace_offers o where o.lead_id = leads.id)`,
      [leadId]
    );
    if (lead.rows.length === 0) {
      return NextResponse.json({ error: "Lead is not an unlisted marketplace lead" }, { status: 409 });
    }
    await pool.query(`insert into lead_marketplace_offers (lead_id, price) values ($1, $2)`, [leadId, price]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
