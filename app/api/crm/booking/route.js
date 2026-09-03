import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> booking events (newest first)
// POST          -> record { lead_id, state, detail? }
const STATES = ["link_sent","viewed","started","partially_completed","signed","order_created"];

export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, state, detail, created_at from booking_events where lead_id=$1 and agent_id=$2 order by created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ events: rows });
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
    if (!b.lead_id || !STATES.includes(b.state)) return NextResponse.json({ error: "lead_id and valid state required" }, { status: 400 });
    const { rows } = await pool.query(
      `insert into booking_events (lead_id, agent_id, state, detail) values ($1,$2,$3,$4) returning id`,
      [b.lead_id, agent.id, b.state, b.detail || null]
    );
    return NextResponse.json({ success: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
