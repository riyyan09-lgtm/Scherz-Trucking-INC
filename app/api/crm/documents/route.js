import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> agent's documents for that lead
// POST          -> create { lead_id, name, url, kind? }
// DELETE        -> { id }
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, lead_id, name, url, kind, created_at
         from lead_documents where lead_id = $1 and agent_id = $2 order by created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ documents: rows });
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
    if (!b.lead_id || !b.name || !b.url) return NextResponse.json({ error: "lead_id, name and url required" }, { status: 400 });
    const { rows } = await pool.query(
      `insert into lead_documents (lead_id, agent_id, tenant_id, name, url, kind, doc_type, version, versions)
       values ($1,$2,$3,$4,$5,$6,$7,1,$8) returning id`,
      [b.lead_id, agent.id, agent.tenant_id, b.name, b.url, b.kind || "other", b.doc_type || "other", JSON.stringify([{ version: 1, url: b.url, created_at: new Date().toISOString() }])]
    );
    return NextResponse.json({ success: true, id: rows[0].id });
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
    await pool.query(`delete from lead_documents where id=$1 and agent_id=$2`, [b.id, agent.id]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
