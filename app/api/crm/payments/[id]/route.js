import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { resolveAgent } from "../../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

const TYPES = ["cash", "ach", "check", "wire", "zelle", "credit_card", "other"];

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
    status = "Paid";
  }
  await pool.query(
    `update leads set broker_collected = $2, broker_remaining = $3, broker_payment_status = $4, broker_refunded = $5, broker_chargebacks = $6 where id = $1`,
    [leadId, collected, remaining, status, refunded, chargebacks]
  );
}

export async function PATCH(request, { params }) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const id = Number(params.id);
    const body = await request.json();
    const own = await pool.query(
      `select p.lead_id from payments p join leads l on p.lead_id = l.id where p.id = $1 and l.assigned_agent_id = $2`,
      [id, agent.id]
    );
    if (own.rows.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    const leadId = own.rows[0].lead_id;
    const sets = [];
    const vals = [];
    const paramSlot = {}; // col -> 1-based index into vals, when bound as a param
    // Idempotent: setting the same column twice replaces the prior assignment
    // instead of emitting "multiple assignments to same column" (Postgres error).
    // Reuses the existing $N slot on a repeat call instead of pushing a new one —
    // pushing a new slot while replacing the sets[] text left the old $N bound
    // in vals but referenced nowhere in the query, which Postgres rejects with
    // "could not determine data type of parameter $N".
    const put = (col, val) => {
      const i = sets.findIndex((s) => s.startsWith(col + " = "));
      if (val === null || val === undefined) {
        // Inline NULL — binding a bare null makes Postgres unable to infer the
        // parameter type ("could not determine data type of parameter $N").
        delete paramSlot[col];
        const assign = `${col} = null`;
        if (i >= 0) sets[i] = assign; else sets.push(assign);
        return;
      }
      if (paramSlot[col] != null) {
        vals[paramSlot[col] - 1] = val; // reuse the existing $N slot
        return; // sets[i] already reads "col = $N", nothing to change
      }
      vals.push(val);
      paramSlot[col] = vals.length;
      const assign = `${col} = $${vals.length}`;
      if (i >= 0) sets[i] = assign; else sets.push(assign);
    };
    if (body.payment_date !== undefined) put("payment_date", body.payment_date || new Date().toISOString().slice(0, 10));
    if (body.type !== undefined) { if (!TYPES.includes(body.type)) return NextResponse.json({ error: "Invalid payment type" }, { status: 400 }); put("type", body.type); }
    if (body.direction !== undefined) put("direction", body.direction);
    if (body.amount !== undefined) put("amount", Number(body.amount || 0));
    if (body.identification !== undefined) put("identification", body.identification || null);
    if (body.notes !== undefined) put("notes", body.notes || null);
    if (body.confirmed !== undefined) put("confirmed", body.confirmed === true || body.confirmed === "true");
    if (body.refunded !== undefined) {
      const ref = body.refunded === true || body.refunded === "true";
      put("refunded", ref);
      put("refund_type", ref ? (body.refund_type || "refund") : null);
      put("refund_reason", ref ? (body.refund_reason || null) : null);
      put("refund_date", ref ? (body.refund_date || new Date().toISOString().slice(0, 10)) : null);
      put("refund_ref", ref ? (body.refund_ref || null) : null);
      if (!ref) put("chargeback_status", null); // no longer reversed
    }
    if (body.chargeback_status !== undefined) {
      const cb = body.chargeback_status || null; // New | Fighting | Won | Lost
      put("chargeback_status", cb);
      if (cb === "Won") {
        // Recovered: money goes back into Broker Earnings.
        put("refunded", false);
        put("refund_type", "chargeback");
      } else if (cb) {
        // New / Fighting / Lost: amount stays out of earnings.
        put("refunded", true);
        put("refund_type", "chargeback");
      }
    }
    if (body.refund_type !== undefined) put("refund_type", body.refund_type || null);
    if (body.refund_reason !== undefined) put("refund_reason", body.refund_reason || null);
    if (body.refund_date !== undefined) put("refund_date", body.refund_date || null);
    if (body.refund_ref !== undefined) put("refund_ref", body.refund_ref || null);
    if (sets.length === 0) return NextResponse.json({ success: true });
    vals.push(id);
    await pool.query(`update payments set ${sets.join(", ")} where id = $${vals.length}`, vals);
    await recomputeBroker(pool, leadId);
    const { rows } = await pool.query(`select * from payments where id = $1`, [id]);
    return NextResponse.json({ payment: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const id = Number(params.id);
    const own = await pool.query(
      `select p.lead_id from payments p join leads l on p.lead_id = l.id where p.id = $1 and l.assigned_agent_id = $2`,
      [id, agent.id]
    );
    if (own.rows.length === 0) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    const leadId = own.rows[0].lead_id;
    await pool.query(`delete from payments where id = $1`, [id]);
    await recomputeBroker(pool, leadId);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
