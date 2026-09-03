import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";
import { recordComms } from "../../../../lib/comms";

export const dynamic = "force-dynamic";

// GET /api/crm/comms?lead_id=123  -> last comms for that (agent-owned) lead
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = Number(new URL(request.url).searchParams.get("lead_id"));
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows: owned } = await pool.query(
      `select id from leads where id = $1 and assigned_agent_id = $2`,
      [leadId, agent.id]
    );
    if (owned.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { rows } = await pool.query(
      `select id, channel, to_address, template, status, created_at
         from comms_log where lead_id = $1 order by created_at desc limit 50`,
      [leadId]
    );
    return NextResponse.json({ comms: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/crm/comms  body: { lead_id, channel, to_address, template, status?, error?, external_id? }
// Used internally by the booking/quote flows to record that an email/SMS was sent.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leadId = Number(body?.lead_id);
  if (!leadId || !["email", "sms"].includes(body?.channel))
    return NextResponse.json({ error: "lead_id and channel(email|sms) required" }, { status: 400 });
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const { rows: owned } = await pool.query(
      `select id from leads where id = $1 and assigned_agent_id = $2`,
      [leadId, agent.id]
    );
    if (owned.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const row = await recordComms({
      leadId,
      channel: body.channel,
      to_address: body.to_address,
      template: body.template,
      status: body.status || "sent",
      error: body.error,
      external_id: body.external_id,
    });
    return NextResponse.json({ success: true, id: row?.id ?? null });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
