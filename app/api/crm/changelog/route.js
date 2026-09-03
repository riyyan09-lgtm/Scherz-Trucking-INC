import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> full change log (append-only, newest first). No DELETE.
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, field, old_value, new_value, actor, created_at
         from change_log where lead_id=$1 and agent_id=$2 order by created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ changes: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
