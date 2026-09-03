import { NextResponse } from "next/server";
import { getPool } from "../../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// Per-agent statistics, computed live from the database.
// GET /api/portal/agents/:id/stats?period=today|week|month|year|lifetime
export async function GET(request, { params }) {
  const email = await getAuthedEmail(request);
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const pool = getPool();
  const tenant = await resolveTenant(pool, email);
  if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || "month";
  const trunc =
    period === "today" ? "day" :
    period === "week" ? "week" :
    period === "month" ? "month" :
    period === "year" ? "year" : "epoch"; // lifetime
  const windowExpr = trunc === "epoch" ? "true" : `l.agent_assigned_at >= date_trunc('${trunc}', now())`;

  try {
    const agentId = Number(params.id);
    const owned = await pool.query(`select id from agents where id = $1 and tenant_id = $2`, [agentId, tenant.id]);
    if (owned.rows.length === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const r = await pool.query(
      `select
         count(*) filter (where ${windowExpr})::int as leads_assigned,
         count(*)::int as leads_total,
         count(*) filter (where l.last_contacted is not null and l.last_contacted >= date_trunc('${trunc}', now()))::int as leads_contacted,
         count(*) filter (where l.status in ('quoted','booked','dispatched','closed') and ${windowExpr === "true" ? "l.created_at >= '1970-01-01'" : "l.created_at >= date_trunc('" + trunc + "', now())"})::int as quotes_created,
         count(*) filter (where l.status IN ('booked','dispatched','delivered','closed') and ${windowExpr === "true" ? "l.closed_at >= '1970-01-01' or l.closed_at is not null" : "l.closed_at >= date_trunc('" + trunc + "', now())"})::int as orders_converted,
         coalesce(sum(l.sale_amount) filter (where l.status IN ('booked','dispatched','delivered','closed') and ${windowExpr === "true" ? "l.closed_at is not null" : "l.closed_at >= date_trunc('" + trunc + "', now())"}) , 0) as total_revenue,
         coalesce(sum(l.total_tariff - coalesce(l.carrier_pay,0)) filter (where l.status IN ('booked','dispatched','delivered','closed') and ${windowExpr === "true" ? "l.closed_at is not null" : "l.closed_at >= date_trunc('" + trunc + "', now())"}) , 0) as broker_fees_earned,
         (select coalesce(sum(p.amount),0) from payments p join leads l2 on p.lead_id = l2.id
            where l2.assigned_agent_id = $1 and lower(p.direction)='customer_broker' and p.confirmed = true
              ${trunc === "epoch" ? "" : "and p.payment_date >= date_trunc('" + trunc + "', now())"}) as broker_fees_collected,
         (select coalesce(sum(l3.total_tariff - coalesce(l3.carrier_pay,0)),0)
            - (select coalesce(sum(p2.amount),0) from payments p2 join leads l4 on p2.lead_id=l4.id
                 where l4.assigned_agent_id = $1 and lower(p2.direction)='customer_broker' and p2.confirmed = true
                 ${trunc === "epoch" ? "" : "and p2.payment_date >= date_trunc('" + trunc + "', now())"})
          from leads l3 where l3.assigned_agent_id = $1 and l3.status IN ('booked','dispatched','delivered','closed')
            ${trunc === "epoch" ? "" : "and l3.closed_at >= date_trunc('" + trunc + "', now())"}) as broker_fees_due,
         (select coalesce(sum(p3.amount),0) from payments p3 join leads l5 on p3.lead_id=l5.id
            where l5.assigned_agent_id = $1 and p3.refunded = true and (p3.refund_type is distinct from 'chargeback')
              ${trunc === "epoch" ? "" : "and coalesce(p3.refund_date, p3.payment_date) >= date_trunc('" + trunc + "', now())"}) as refund_total,
         (select coalesce(sum(p4.amount),0) from payments p4 join leads l6 on p4.lead_id=l6.id
            where l6.assigned_agent_id = $1 and p4.refunded = true and p4.refund_type = 'chargeback'
              ${trunc === "epoch" ? "" : "and coalesce(p4.refund_date, p4.payment_date) >= date_trunc('" + trunc + "', now())"}) as chargeback_total,
         (select coalesce(sum(p5.amount),0) from payments p5 join leads l7 on p5.lead_id=l7.id
            where l7.assigned_agent_id = $1 and p5.refunded = true and p5.refund_type = 'chargeback' and p5.chargeback_status = 'Won'
              ${trunc === "epoch" ? "" : "and coalesce(p5.refund_date, p5.payment_date) >= date_trunc('" + trunc + "', now())"}) as won_chargebacks,
         (select coalesce(sum(p6.amount),0) from payments p6 join leads l8 on p6.lead_id=l8.id
            where l8.assigned_agent_id = $1 and p6.refunded = true and p6.refund_type = 'chargeback' and p6.chargeback_status = 'Lost'
              ${trunc === "epoch" ? "" : "and coalesce(p6.refund_date, p6.payment_date) >= date_trunc('" + trunc + "', now())"}) as lost_chargebacks
       from leads l
       where l.assigned_agent_id = $1`,
      [agentId]
    );
    const row = r.rows[0] || {};

    // Activity (calls/texts/emails/last active/login) sourced from the
    // agent_activity table. Wrapped so a missing table/column degrades to 0
    // instead of taking the whole stats modal down.
    let activity = { calls: 0, texts: 0, emails: 0, last_active: null, last_login: null };
    try {
      const w = trunc === "epoch" ? "" : `and created_at >= date_trunc('${trunc}', now())`;
      const act = await pool.query(
        `select
           count(*) filter (where activity_type = 'call') as calls,
           count(*) filter (where activity_type = 'text') as texts,
           count(*) filter (where activity_type = 'email') as emails,
           max(created_at) filter (where activity_type in ('call','text','email','login','active','assign','quote','convert')) as last_active,
           max(created_at) filter (where activity_type = 'login') as last_login
         from agent_activity where agent_id = $1 ${w}`,
        [agentId]
      );
      const a = act.rows[0] || {};
      activity = {
        calls: Number(a.calls || 0),
        texts: Number(a.texts || 0),
        emails: Number(a.emails || 0),
        last_active: a.last_active || null,
        last_login: a.last_login || null,
      };
    } catch { /* agent_activity not yet available — leave zeros */ }

    return NextResponse.json({
      stats: {
        period,
        leads_assigned: Number(row.leads_assigned || 0),
        leads_contacted: Number(row.leads_contacted || 0),
        quotes_created: Number(row.quotes_created || 0),
        orders_converted: Number(row.orders_converted || 0),
        conversion_pct: row.leads_assigned ? Math.round((row.orders_converted / row.leads_assigned) * 100) : 0,
        total_revenue: Number(row.total_revenue || 0),
        broker_fees_earned: Number(row.broker_fees_earned || 0),
        broker_fees_collected: Number(row.broker_fees_collected || 0),
        broker_fees_due: Math.max(0, Number(row.broker_fees_due || 0)),
        refund_total: Number(row.refund_total || 0),
        chargeback_total: Number(row.chargeback_total || 0),
        won_chargebacks: Number(row.won_chargebacks || 0),
        lost_chargebacks: Number(row.lost_chargebacks || 0),
        calls: activity.calls,
        texts: activity.texts,
        emails: activity.emails,
        last_active: activity.last_active,
        last_login: activity.last_login,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
