import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> pricing history for that lead (most recent first)
// POST          -> record { lead_id, total_tariff?, carrier_pay?, note? }
//   (Typically written by the CRM leads PATCH producer whenever tariff/carrier_pay change.)
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, lead_id, total_tariff, carrier_pay, note, created_at
         from pricing_history where lead_id = $1 and agent_id = $2 order by created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ pricing: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `insert into pricing_history (lead_id, agent_id, total_tariff, carrier_pay, note)
       values ($1,$2,$3,$4,$5) returning id`,
      [b.lead_id, agent.id, b.total_tariff ?? null, b.carrier_pay ?? null, b.note || null]
    );
    return NextResponse.json({ success: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
