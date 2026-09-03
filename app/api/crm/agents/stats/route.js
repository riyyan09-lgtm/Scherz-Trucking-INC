import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { resolveAgent } from "../../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

const RANGES = {
  today: "created_at >= current_date",
  week: "created_at >= now() - interval '7 days'",
  month: "created_at >= now() - interval '30 days'",
  year: "created_at >= now() - interval '365 days'",
  lifetime: "1=1",
};

// GET /api/crm/agents/stats?agent_id=NN&range=month
// Aggregates live stats for an agent within a time window.
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    const url = new URL(request.url);
    // Agents may only view their own stats; admins could pass any id but the
    // CRM session is agent-scoped, so we default to the caller.
    const agentId = Number(url.searchParams.get("agent_id")) || agent.id;
    if (agentId !== agent.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const range = RANGES[url.searchParams.get("range")] || RANGES.lifetime;
    const p = pool;

    const [leadsAgg, act, paymentsAgg, last] = await Promise.all([
      p.query(
        `select
           count(*) as assigned,
           count(*) filter (where status in ('quoted','booked','dispatched','delivered','closed')) as quoted,
           count(*) filter (where status in ('booked','dispatched','delivered','closed')) as converted,
           coalesce(sum(total_tariff - carrier_pay) filter (where status in ('booked','dispatched','delivered','closed')),0) as revenue,
           coalesce(sum(broker_collected) filter (where status in ('booked','dispatched','delivered','closed')),0) as collected,
           coalesce(sum(broker_remaining) filter (where status in ('booked','dispatched','delivered','closed')),0) as due,
           coalesce(sum(broker_refunded) filter (where status in ('booked','dispatched','delivered','closed')),0) as refund_total,
           coalesce(sum(broker_chargebacks) filter (where status in ('booked','dispatched','delivered','closed')),0) as chargeback_total
         from leads where assigned_agent_id = $1 and ${range}`,
        [agentId]
      ),
      p.query(
        `select activity_type, count(*) as c
         from agent_activity where agent_id = $1 and ${range}
         group by activity_type`,
        [agentId]
      ),
      p.query(
        `select
           coalesce(sum(amount) filter (where refunded = true and (refund_type is distinct from 'chargeback')),0) as refund_amt,
           coalesce(sum(amount) filter (where refund_type = 'chargeback'),0) as cb_amt,
           count(*) filter (where refund_type = 'chargeback' and chargeback_status = 'Won') as cb_won,
           count(*) filter (where refund_type = 'chargeback' and chargeback_status = 'Lost') as cb_lost,
           count(*) filter (where refund_type = 'chargeback') as cb_total
         from payments where lead_id in (select id from leads where assigned_agent_id = $1) and ${range}`,
        [agentId]
      ),
      p.query(
        `select max(created_at) filter (where activity_type = 'login') as last_login,
                max(created_at) filter (where activity_type in ('call','text','email','login','active','assign','quote','convert')) as last_active
         from agent_activity where agent_id = $1`,
        [agentId]
      ),
    ]);

    const l = leadsAgg.rows[0];
    const counts = {};
    act.rows.forEach((r) => { counts[r.activity_type] = Number(r.c); });
    const pay = paymentsAgg.rows[0];
    const lv = last.rows[0];

    const assigned = Number(l.assigned || 0);
    const converted = Number(l.converted || 0);
    const revenue = Number(l.revenue || 0);
    const conversion = assigned > 0 ? Math.round((converted / assigned) * 100) : 0;

    return NextResponse.json({
      agent_id: agentId,
      range: url.searchParams.get("range") || "lifetime",
      sales: {
        leads_assigned: assigned,
        leads_contacted: (counts.call || 0) + (counts.text || 0) + (counts.email || 0),
        quotes_created: Number(l.quoted || 0),
        orders_converted: converted,
        conversion_pct: conversion,
        total_revenue: revenue,
        broker_fees_earned: revenue,
      },
      payments: {
        broker_fees_collected: Number(l.collected || 0),
        broker_fees_due: Number(l.due || 0),
        refund_total: Number(pay.refund_amt || 0) + Number(l.refund_total || 0),
        chargeback_total: Number(pay.cb_amt || 0) + Number(l.chargeback_total || 0),
        won_chargebacks: Number(pay.cb_won || 0),
        lost_chargebacks: Number(pay.cb_lost || 0),
      },
      activity: {
        calls: counts.call || 0,
        texts: counts.text || 0,
        emails: counts.email || 0,
        last_active: lv.last_active || null,
        last_login: lv.last_login || null,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

// POST /api/crm/agents/stats  body: { type, lead_id?, meta? }
// Records an agent activity event (call/text/email/login/active/...).
export async function POST(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    let body = {};
    try { body = await request.json(); } catch {}
    const type = String(body.type || "");
    if (!type) return NextResponse.json({ error: "type required" }, { status: 400 });
    await pool.query(
      `insert into agent_activity (agent_id, tenant_id, activity_type, lead_id, meta)
       values ($1,$2,$3,$4,$5)`,
      [agent.id, agent.tenant_id, type, body.lead_id ? Number(body.lead_id) : null, body.meta ? JSON.stringify(body.meta) : null]
    );
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
