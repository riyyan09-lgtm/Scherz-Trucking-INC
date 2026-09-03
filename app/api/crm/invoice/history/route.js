import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { resolveAgent } from "../../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET /api/crm/invoice/history?lead_id=123 — past generated invoices for an
// order, newest first, so an agent can re-download without regenerating.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const leadId = Number(searchParams.get("lead_id"));
  if (!leadId) return NextResponse.json({ error: "Provide lead_id" }, { status: 400 });

  const pool = getPool();
  try {
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    const { rows } = await pool.query(
      `select i.id, i.kind, i.generated_at, a.name as generated_by_name, v.version as template_version
         from invoices i
         left join agents a on a.id = i.generated_by
         left join invoice_template_versions v on v.id = i.template_version_id
         join leads l on l.id = i.lead_id
        where i.lead_id = $1 and l.tenant_id = $2
        order by i.generated_at desc`,
      [leadId, agent.tenant_id]
    );
    return NextResponse.json({ invoices: rows });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
