import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";
import { getSignatureHistory } from "../../../../lib/dispatch";

export const dynamic = "force-dynamic";

// GET /api/crm/signatures?lead_id=123 -> signature_history rows (oldest first)
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = Number(new URL(request.url).searchParams.get("lead_id"));
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const owned = await pool.query(
      `select id from leads where id = $1 and assigned_agent_id = $2`,
      [leadId, agent.id]
    );
    if (owned.rows.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ history: await getSignatureHistory(pool, leadId) });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// NOTE: there is intentionally NO POST here. Signature history is the chain of
// custody for the customer's e-signature — entries are written only by the
// customer booking flow (app/api/book/[token]/route.js) at the moment of
// signing. Letting an agent insert rows would let the chain be fabricated.
