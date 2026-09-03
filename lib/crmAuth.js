// Auth for the agent CRM (/crm): a request is a valid agent when its
// Supabase session token resolves to an email matching an agents row.
// Agent logins are provisioned by the tenant from the portal's Agents tab.
import { getAuthedEmail } from "./portalAuth";

export async function resolveAgent(pool, request) {
  const email = await getAuthedEmail(request);
  if (!email) return { status: 401, error: "Unauthorized" };
  const { rows } = await pool.query(
    `select a.id, a.name, a.email, a.active, a.tenant_id, t.company_name
     from agents a join tenants t on a.tenant_id = t.id
     where lower(a.email) = $1
     limit 1`,
    [email]
  );
  if (rows.length === 0) return { status: 403, error: "No agent account for this login" };
  if (!rows[0].active) return { status: 403, error: "This agent account is deactivated" };
  return { agent: rows[0] };
}
