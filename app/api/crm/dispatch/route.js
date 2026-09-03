import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";
import {
  listCarriers, createCarrier, getLeadCarriers, setInterested,
  assignCarrier, unassignCarrier, getPayments, addPayment, setPaymentStatus,
} from "../../../../lib/dispatch";

export const dynamic = "force-dynamic";

// All endpoints require a valid agent session and operate only on leads the
// agent owns (assigned_agent_id = agent.id), matching the CRM leads route.

async function ownedLead(pool, agentId, leadId) {
  const { rows } = await pool.query(
    `select id from leads where id = $1 and assigned_agent_id = $2`,
    [leadId, agentId]
  );
  return rows.length > 0;
}

// GET /api/crm/dispatch?lead_id=123
//   -> { carriers, leadCarriers, payments }
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = Number(new URL(request.url).searchParams.get("lead_id"));
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    if (!(await ownedLead(pool, agent.id, leadId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [carriers, leadCarriers, payments] = await Promise.all([
      listCarriers(pool, agent.tenant_id),
      getLeadCarriers(pool, leadId),
      getPayments(pool, leadId),
    ]);
    return NextResponse.json({ carriers, leadCarriers, payments });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/crm/dispatch  body: { lead_id, action, ... }
//   action:
//     'add_carrier'      { name, mc_number?, contact_name?, email?, phone?, equipment?, notes? }
//     'set_interested'   { lead_id, carrier_id, interested, notes? }
//     'assign'           { lead_id, carrier_id }
//     'unassign'         { lead_id }
//     'add_payment'      { lead_id, party, kind, amount, status?, method?, reference?, note? }
//     'payment_status'   { payment_id, status }
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leadId = Number(body?.lead_id);
  if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });

  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    if (!(await ownedLead(pool, agent.id, leadId)))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const action = body.action;
    if (action === "add_carrier") {
      if (!body.name) return NextResponse.json({ error: "Carrier name required" }, { status: 400 });
      const id = await createCarrier(pool, agent.tenant_id, body);
      return NextResponse.json({ success: true, carrier_id: id });
    }
    if (action === "set_interested" || action === "assign") {
      if (!body.carrier_id) return NextResponse.json({ error: "carrier_id required" }, { status: 400 });
      const own = await pool.query(`select id from carriers where id = $1 and tenant_id = $2`, [Number(body.carrier_id), agent.tenant_id]);
      if (own.rows.length === 0) return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
      if (action === "set_interested") await setInterested(pool, leadId, Number(body.carrier_id), body.interested, body.notes);
      else await assignCarrier(pool, leadId, Number(body.carrier_id));
      return NextResponse.json({ success: true });
    }
    if (action === "unassign") {
      await unassignCarrier(pool, leadId);
      return NextResponse.json({ success: true });
    }
    if (action === "add_payment") {
      if (!["customer", "carrier"].includes(body.party) || !body.kind || body.amount == null)
        return NextResponse.json({ error: "party, kind, and amount required" }, { status: 400 });
      const row = await addPayment(pool, { ...body, leadId });
      return NextResponse.json({ success: true, payment_id: row.id, paid_at: row.paid_at });
    }
    if (action === "payment_status") {
      if (!body.payment_id || !body.status)
        return NextResponse.json({ error: "payment_id and status required" }, { status: 400 });
      await setPaymentStatus(pool, Number(body.payment_id), body.status, body.paid_at);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
