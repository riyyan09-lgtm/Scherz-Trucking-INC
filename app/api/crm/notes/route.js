import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> agent's notes for that lead
// POST          -> create { lead_id, body, kind?, pinned? }
// PATCH         -> update { id, body?, kind?, pinned? }
// DELETE        -> { id }
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, lead_id, kind, body, pinned, created_at
         from crm_notes where lead_id = $1 and agent_id = $2 order by pinned desc, created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ notes: rows });
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
    if (!b.lead_id || !b.body) return NextResponse.json({ error: "lead_id and body required" }, { status: 400 });
    const { rows } = await pool.query(
      `insert into crm_notes (lead_id, agent_id, tenant_id, kind, body, pinned, author, attachments, mentions)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [b.lead_id, agent.id, agent.tenant_id, b.kind || "internal", b.body, b.pinned || false, agent.email, JSON.stringify(b.attachments || []), JSON.stringify(b.mentions || [])]
    );
    return NextResponse.json({ success: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function PATCH(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sets = [];
    const vals = [agent.id];
    let i = 2;
    if (b.body !== undefined) { sets.push(`body=$${i++}`); vals.push(b.body); sets.push(`edited_at=now()`); }
    if (b.kind !== undefined) { sets.push(`kind=$${i++}`); vals.push(b.kind); }
    if (b.pinned !== undefined) { sets.push(`pinned=$${i++}`); vals.push(b.pinned); }
    if (b.attachments !== undefined) { sets.push(`attachments=$${i++}`); vals.push(JSON.stringify(b.attachments)); }
    if (b.mentions !== undefined) { sets.push(`mentions=$${i++}`); vals.push(JSON.stringify(b.mentions)); }
    if (sets.length === 0) return NextResponse.json({ success: true });
    vals.push(b.id);
    await pool.query(
      `update crm_notes set ${sets.join(", ")} where id=$${vals.length} and agent_id=$1`,
      vals
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function DELETE(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await pool.query(`delete from crm_notes where id=$1 and agent_id=$2`, [b.id, agent.id]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
