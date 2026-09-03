// Automatic lead distribution to a tenant's reps: whenever a lead lands on a
// tenant (routing at capture time, or the platform admin handing one over),
// it goes to the ACTIVE agent who was assigned least recently — a natural
// one-by-one rotation — skipping reps already at the tenant's
// "N leads per rep per day/week" cap. If every rep is at cap (or the tenant
// has no agents), the lead stays unassigned and can be picked up later.
import { sendAgentAssignmentEmail } from "./crmEmails";
import { createNotification } from "./notifications";

export async function autoAssignLead(pool, leadId, tenantId) {
  try {
    if (!leadId || !tenantId) return null;
    const settings = await pool.query(
      `select agent_lead_cap, agent_cap_period from tenants where id = $1`,
      [tenantId]
    );
    if (settings.rows.length === 0) return null;
    const cap = settings.rows[0].agent_lead_cap;
    const period = settings.rows[0].agent_cap_period === "week" ? "week" : "day";

    const pick = await pool.query(
      `select a.id, a.name, a.email
       from agents a
       where a.tenant_id = $1 and a.active and a.deleted_at is null
         -- off_today/vacation/disabled reps never receive new leads; busy
         -- reps still can but sort behind active ones (see order by below).
         and a.availability in ('active', 'busy')
         and ($2::int is null or (
           select count(*) from leads l
           where l.assigned_agent_id = a.id
             and l.agent_assigned_at >= date_trunc($3, now())
         ) < $2::int)
       order by (a.availability = 'busy'),
                (select max(l2.agent_assigned_at) from leads l2 where l2.assigned_agent_id = a.id) asc nulls first,
                a.id asc
       limit 1`,
      [tenantId, cap, period]
    );
    if (pick.rows.length === 0) return null;

    await pool.query(
      `update leads set assigned_agent_id = $1, agent_assigned_at = now() where id = $2`,
      [pick.rows[0].id, leadId]
    );

    // Alert the rep by email so they can act from anywhere. Fire-and-forget.
    const company = await pool.query(`select company_name from tenants where id = $1`, [tenantId]);
    sendAgentAssignmentEmail({
      agentEmail: pick.rows[0].email,
      agentName: pick.rows[0].name,
      leadId,
      companyName: company.rows[0]?.company_name || "your team",
    }).catch(() => {});
    // In-app notification too (Phase 5). Also fire-and-forget.
    createNotification({ agentId: pick.rows[0].id, kind: "lead_assigned", payload: { lead_id: leadId } }).catch(() => {});

    return pick.rows[0];
  } catch {
    // Auto-assignment must never break lead capture -- the lead simply
    // stays unassigned.
    return null;
  }
}
