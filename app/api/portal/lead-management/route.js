import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// GET /api/portal/lead-management — dashboard summary + per-agent
// performance cards for the tenant portal's Lead Management page.
// "Converted" = the lead reached an order (booked/dispatched/delivered/closed).
const CONVERTED = "'booked','dispatched','delivered','closed'";

export async function GET(request) {
  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    const [summaryRes, agentsRes] = await Promise.all([
      pool.query(
        `select
           count(*) filter (where assigned_agent_id is not null) as total_assigned,
           count(*) filter (where assigned_agent_id is null and status <> 'dead') as unassigned,
           count(*) filter (where assigned_agent_id is not null and last_contacted is null
             and status in ('new','assigned') and agent_assigned_at <= now() - interval '24 hours') as waiting_24h,
           count(*) filter (where assigned_agent_id is not null and last_contacted is null
             and status in ('new','assigned') and agent_assigned_at <= now() - interval '72 hours') as waiting_72h,
           count(*) filter (where agent_assigned_at >= date_trunc('month', now())) as assigned_month,
           count(*) filter (where status in (${CONVERTED}) and closed_at >= date_trunc('month', now())) as converted_month
         from leads where tenant_id = $1`,
        [tenant.id]
      ),
      pool.query(
        `select a.id, a.name, a.email, a.availability,
           count(l.id) filter (where l.status <> 'dead') as queue_assigned,
           count(l.id) filter (where l.status in ('new','assigned') and l.last_contacted is null) as queue_untouched,
           count(l.id) filter (where l.status = 'contacted') as queue_contacted,
           count(l.id) filter (where l.status = 'quoted') as queue_quoted,
           count(l.id) filter (where l.status in (${CONVERTED})) as queue_converted,
           count(l.id) filter (where l.agent_assigned_at >= date_trunc('day', now())) as assigned_today,
           count(l.id) filter (where l.status in (${CONVERTED}) and l.closed_at >= date_trunc('day', now())) as orders_today,
           count(l.id) filter (where l.agent_assigned_at >= date_trunc('week', now())) as assigned_week,
           count(l.id) filter (where l.status in (${CONVERTED}) and l.closed_at >= date_trunc('week', now())) as orders_week,
           count(l.id) filter (where l.agent_assigned_at >= date_trunc('month', now())) as assigned_month,
           count(l.id) filter (where l.status in (${CONVERTED}) and l.closed_at >= date_trunc('month', now())) as orders_month,
           count(l.id) as assigned_lifetime,
           count(l.id) filter (where l.status in (${CONVERTED})) as orders_lifetime
         from agents a
         left join leads l on l.assigned_agent_id = a.id
         where a.tenant_id = $1 and a.deleted_at is null and a.agent_type = 'tenant_internal'
         group by a.id, a.name, a.email, a.availability, a.created_at
         order by a.created_at`,
        [tenant.id]
      ),
    ]);

    const s = summaryRes.rows[0] || {};
    const pct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
    const perf = (row, assignedKey, ordersKey) => ({
      assigned: Number(row[assignedKey] || 0),
      orders: Number(row[ordersKey] || 0),
      conversion_pct: pct(Number(row[ordersKey] || 0), Number(row[assignedKey] || 0)),
    });

    const agents = agentsRes.rows.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      availability: a.availability || "active",
      queue: {
        assigned: Number(a.queue_assigned || 0),
        untouched: Number(a.queue_untouched || 0),
        contacted: Number(a.queue_contacted || 0),
        quoted: Number(a.queue_quoted || 0),
        converted: Number(a.queue_converted || 0),
      },
      today: perf(a, "assigned_today", "orders_today"),
      week: perf(a, "assigned_week", "orders_week"),
      month: perf(a, "assigned_month", "orders_month"),
      lifetime: perf(a, "assigned_lifetime", "orders_lifetime"),
    }));

    return NextResponse.json({
      summary: {
        total_assigned: Number(s.total_assigned || 0),
        unassigned: Number(s.unassigned || 0),
        active_today: agents.filter((a) => a.availability === "active").length,
        off_today: agents.filter((a) => a.availability !== "active").length,
        avg_conversion_pct: pct(Number(s.converted_month || 0), Number(s.assigned_month || 0)),
        waiting_24h: Number(s.waiting_24h || 0),
        waiting_72h: Number(s.waiting_72h || 0),
      },
      agents,
    });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
