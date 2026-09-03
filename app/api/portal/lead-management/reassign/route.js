import { NextResponse } from "next/server";
import { getPool, withTransaction } from "../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../lib/portalAuth";
import { createNotification } from "../../../../../lib/notifications";

export const dynamic = "force-dynamic";

// POST /api/portal/lead-management/reassign
// body: {
//   lead_ids: number[],
//   to_agent_id: number | null,   // null = Unassign
//   keep_assignment_date?: bool,  // default false — normally a reassignment
//                                 // restarts the clock for cap/aging purposes
//   reset_follow_up?: bool,       // default false — clears follow_up_date
//   notify?: bool,                // default true — in-app notification to the receiving agent
//   force?: bool,                 // bypass the cap warning
//   reason?: string,              // free text, stored on the audit trail
// }
// Handles both "Reassign Leads" (to_agent_id set) and "Unassign Leads"
// (to_agent_id null) from the Lead Management page's bulk actions.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids.map(Number).filter(Boolean) : [];
  if (leadIds.length === 0) return NextResponse.json({ error: "Provide at least one lead id" }, { status: 400 });
  const toAgentId = body.to_agent_id != null ? Number(body.to_agent_id) : null;

  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    const owned = await pool.query(
      `select id, name, assigned_agent_id from leads where id = any($1::int[]) and tenant_id = $2`,
      [leadIds, tenant.id]
    );
    if (owned.rows.length !== leadIds.length) {
      return NextResponse.json({ error: "One or more leads don't belong to your account" }, { status: 404 });
    }

    let toAgent = null;
    if (toAgentId) {
      const a = await pool.query(`select id, name from agents where id = $1 and tenant_id = $2`, [toAgentId, tenant.id]);
      if (a.rows.length === 0) return NextResponse.json({ error: "Receiving agent not found" }, { status: 404 });
      toAgent = a.rows[0];

      // Cap check: how many of these leads would land on the receiving agent
      // within the tenant's current cap period, on top of what they already
      // have. Mirrors the "Assign at most N leads per rep per day/week"
      // setting lib/autoAssign.js enforces on auto-routing.
      if (!body.force) {
        const settings = await pool.query(`select agent_lead_cap, agent_cap_period from tenants where id = $1`, [tenant.id]);
        const cap = settings.rows[0]?.agent_lead_cap;
        const period = settings.rows[0]?.agent_cap_period === "week" ? "week" : "day";
        if (cap) {
          const already = await pool.query(
            `select count(*)::int as n from leads
             where assigned_agent_id = $1 and agent_assigned_at >= date_trunc('${period}', now())`,
            [toAgentId]
          );
          // Leads already assigned to this agent, among the ones being moved,
          // don't count twice against the cap.
          const alreadyTheirs = owned.rows.filter((r) => r.assigned_agent_id === toAgentId).length;
          const incoming = leadIds.length - alreadyTheirs;
          const projected = Number(already.rows[0].n) + incoming;
          if (projected > cap) {
            return NextResponse.json({
              needs_confirm: true,
              message: `${toAgent.name} has reached today's assignment limit (${cap}/${period}). Continue anyway?`,
            });
          }
        }
      }
    }

    const action = toAgentId ? "reassigned" : "unassigned";
    await withTransaction(async (tx) => {
      const sets = ["assigned_agent_id = $1"];
      const vals = [toAgentId];
      if (!body.keep_assignment_date) sets.push(toAgentId ? "agent_assigned_at = now()" : "agent_assigned_at = null");
      if (body.reset_follow_up) sets.push("follow_up_date = null");
      vals.push(leadIds, tenant.id);
      await tx.query(
        `update leads set ${sets.join(", ")} where id = any($${vals.length - 1}::int[]) and tenant_id = $${vals.length}`,
        vals
      );
      for (const lead of owned.rows) {
        await tx.query(
          `insert into activity_log (entity_type, entity_id, action, actor, summary, details)
           values ('lead', $1, $2, $3, $4, $5)`,
          [
            lead.id,
            action,
            email,
            toAgentId
              ? `Reassigned to ${toAgent.name}${body.reason ? ` — ${body.reason}` : ""}`
              : `Unassigned${body.reason ? ` — ${body.reason}` : ""}`,
            JSON.stringify({ from_agent_id: lead.assigned_agent_id, to_agent_id: toAgentId, reason: body.reason || null }),
          ]
        );
      }
    });

    if (toAgentId && body.notify !== false) {
      await createNotification({
        agentId: toAgentId,
        kind: "lead_reassigned",
        payload: { count: leadIds.length, lead_ids: leadIds },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, moved: leadIds.length });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
