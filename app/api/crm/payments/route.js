import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

const TYPES = ["cash", "ach", "check", "wire", "zelle", "credit_card", "other"];

// When a customer->broker payment is recorded/edited/deleted, recompute the
// lead's broker collected / remaining / status from the CONFIRMED payment set.
// Unconfirmed (auto-drafted broker-fee) payments do not count until confirmed —
// otherwise the broker fee would show as collected the instant it's created.
async function recomputeBroker(pool, leadId) {
  const r = await pool.query(
    `select l.total_tariff, l.carrier_pay,
            coalesce(sum(p.amount) filter (where p.confirmed = true and (p.refunded is not true)),0) as collected,
            coalesce(sum(p.amount) filter (where p.refunded = true and (p.refund_type is distinct from 'chargeback')),0) as refunded,
            coalesce(sum(p.amount) filter (where p.refunded = true and p.refund_type = 'chargeback'),0) as chargebacks
     from leads l
     left join payments p on p.lead_id = l.id and lower(p.direction) = 'customer_broker'
     where l.id = $1 group by l.id, l.total_tariff, l.carrier_pay`,
    [leadId]
  );
  const row = r.rows[0];
  if (!row) return;
  const tariff = Number(row.total_tariff || 0);
  const carrier = Number(row.carrier_pay || 0);
  const brokerFee = Math.max(0, tariff - carrier);
  const collected = Number(row.collected || 0);
  const refunded = Number(row.refunded || 0);
  const chargebacks = Number(row.chargebacks || 0);
  const remaining = Math.max(0, brokerFee - collected);
  let status = "Unpaid";
  if (brokerFee > 0) {
    if (remaining <= 0.005) status = "Paid";
    else if (collected > 0.005) status = "Partial";
  } else {
    status = "Paid"; // nothing to collect
  }
  await pool.query(
    `update leads set broker_collected = $2, broker_remaining = $3, broker_payment_status = $4, broker_refunded = $5, broker_chargebacks = $6 where id = $1`,
    [leadId, collected, remaining, status, refunded, chargebacks]
  );
}

export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const url = new URL(request.url);
    const leadId = Number(url.searchParams.get("lead_id"));
    const refundsMode = url.searchParams.get("refunds") === "1";
    if (refundsMode) {
      // Refunds/Chargebacks dashboard: every reversed payment for this agent's
      // leads, joined to the lead for customer/order context.
      const { rows } = await pool.query(
        `select p.*, l.id as lead_id, l.name as customer, l.order_number,
                l.origin_city, l.origin_state, l.destination_city, l.destination_state
         from payments p join leads l on p.lead_id = l.id
         where l.assigned_agent_id = $1 and p.refunded = true
         order by coalesce(p.refund_date, p.payment_date) desc, p.id desc`,
        [agent.id]
      );
      return NextResponse.json({ payments: rows });
    }
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select p.* from payments p join leads l on p.lead_id = l.id
       where p.lead_id = $1 and l.assigned_agent_id = $2 order by p.payment_date desc, p.id desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ payments: rows });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const body = await request.json();
    const leadId = Number(body.lead_id);
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    if (!TYPES.includes(body.type)) return NextResponse.json({ error: "Invalid payment type" }, { status: 400 });
    if (!body.direction) return NextResponse.json({ error: "Direction required" }, { status: 400 });
    const lead = await pool.query(`select id from leads where id = $1 and assigned_agent_id = $2`, [leadId, agent.id]);
    if (lead.rows.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const amount = Number(body.amount || 0);
    const confirmed = body.confirmed === false ? false : true; // default confirmed
    const isBroker = body.is_broker_fee === true || body.direction === "customer_broker";
    const refunded = body.refunded === true;
    const { rows } = await pool.query(
      `insert into payments (lead_id, payment_date, type, direction, amount, identification, notes, user_email, confirmed, is_broker_fee, refunded, refund_type, refund_reason, refund_date, refund_ref)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
      [leadId, body.payment_date || new Date().toISOString().slice(0, 10), body.type, body.direction,
       amount, body.identification || null, body.notes || null, agent.email, confirmed, isBroker,
       refunded, refunded ? (body.refund_type || "refund") : null, refunded ? (body.refund_reason || null) : null,
       refunded ? (body.refund_date || new Date().toISOString().slice(0, 10)) : null, refunded ? (body.refund_ref || null) : null]
    );
    await recomputeBroker(pool, leadId);
    return NextResponse.json({ payment: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
