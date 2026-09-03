import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// POST /api/portal/assign — { lead_id, agent_id | null }
// Hands one of the tenant's leads to one of their reps (or back to
// unassigned). Enforces the tenant's "max leads per rep per day/week"
// setting: assignment is refused once the rep is at cap for the period.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leadId = Number(body?.lead_id);
  const agentId = body?.agent_id ? Number(body.agent_id) : null;
  if (!leadId) return NextResponse.json({ error: "Provide lead_id" }, { status: 400 });

  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account for this login" }, { status: 403 });

    const lead = await pool.query(`select id from leads where id = $1 and tenant_id = $2`, [leadId, tenant.id]);
    if (lead.rows.length === 0) return NextResponse.json({ error: "That lead is not yours" }, { status: 404 });

    if (agentId === null) {
      await pool.query(`update leads set assigned_agent_id = null, agent_assigned_at = null where id = $1`, [leadId]);
      return NextResponse.json({ success: true });
    }

    const agent = await pool.query(
      `select id, name, active from agents where id = $1 and tenant_id = $2`,
      [agentId, tenant.id]
    );
    if (agent.rows.length === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    if (!agent.rows[0].active) return NextResponse.json({ error: `${agent.rows[0].name} is deactivated` }, { status: 409 });

    const settings = await pool.query(`select agent_lead_cap, agent_cap_period from tenants where id = $1`, [tenant.id]);
    const cap = settings.rows[0].agent_lead_cap;
    const period = settings.rows[0].agent_cap_period === "week" ? "week" : "day";
    if (cap) {
      const used = await pool.query(
        `select count(*)::int as n from leads
         where assigned_agent_id = $1 and id <> $2
           and agent_assigned_at >= date_trunc($3, now())`,
        [agentId, leadId, period]
      );
      if (used.rows[0].n >= cap) {
        return NextResponse.json(
          { error: `${agent.rows[0].name} is at the cap (${cap} leads per ${period})` },
          { status: 409 }
        );
      }
    }

    await pool.query(`update leads set assigned_agent_id = $1, agent_assigned_at = now() where id = $2`, [agentId, leadId]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
