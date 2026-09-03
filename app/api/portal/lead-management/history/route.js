import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// GET /api/portal/lead-management/history?lead_id=<optional>
// Reassignment/unassignment audit trail, written by the reassign and
// redistribute routes (activity_log, entity_type='lead'). Scoped to this
// tenant's leads only. Pass lead_id to see just one lead's history.
export async function GET(request) {
  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    const url = new URL(request.url);
    const leadId = Number(url.searchParams.get("lead_id")) || null;

    const vals = [tenant.id];
    let leadFilter = "";
    if (leadId) {
      vals.push(leadId);
      leadFilter = `and al.entity_id = $${vals.length}`;
    }

    const { rows } = await pool.query(
      `select al.id, al.entity_id as lead_id, al.action, al.actor, al.summary, al.details, al.created_at,
              l.name as customer
       from activity_log al
       join leads l on l.id = al.entity_id
       where al.entity_type = 'lead' and al.action in ('reassigned', 'unassigned')
         and l.tenant_id = $1 ${leadFilter}
       order by al.created_at desc
       limit 200`,
      vals
    );

    return NextResponse.json({ history: rows });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
