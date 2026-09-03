import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> sales activity (newest first)
// POST          -> record { lead_id, kind, detail? }
const KINDS = ["email_sent","sms_sent","call","voicemail","booking_link_sent",
  "quote_viewed","booking_started","booking_completed","agreement_signed"];

export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, kind, detail, created_at from sales_activity where lead_id=$1 and agent_id=$2 order by created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ activity: rows });
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
    if (!b.lead_id || !KINDS.includes(b.kind)) return NextResponse.json({ error: "lead_id and valid kind required" }, { status: 400 });
    const { rows } = await pool.query(
      `insert into sales_activity (lead_id, agent_id, tenant_id, kind, detail) values ($1,$2,$3,$4,$5) returning id`,
      [b.lead_id, agent.id, agent.tenant_id, b.kind, b.detail || null]
    );
    return NextResponse.json({ success: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
