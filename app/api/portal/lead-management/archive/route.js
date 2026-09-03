import { NextResponse } from "next/server";
import { getPool, withTransaction } from "../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// POST /api/portal/lead-management/archive  body: { lead_ids: number[] }
// Bulk "Archive" from the View Leads table — marks leads dead (the CRM's
// existing terminal/lost status) so they drop out of active queues.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const leadIds = Array.isArray(body?.lead_ids) ? body.lead_ids.map(Number).filter(Boolean) : [];
  if (leadIds.length === 0) return NextResponse.json({ error: "Provide at least one lead id" }, { status: 400 });

  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    const owned = await pool.query(`select id from leads where id = any($1::int[]) and tenant_id = $2`, [leadIds, tenant.id]);
    if (owned.rows.length !== leadIds.length) {
      return NextResponse.json({ error: "One or more leads don't belong to your account" }, { status: 404 });
    }

    await withTransaction(async (tx) => {
      await tx.query(`update leads set status = 'dead' where id = any($1::int[]) and tenant_id = $2`, [leadIds, tenant.id]);
      for (const id of leadIds) {
        await tx.query(
          `insert into activity_log (entity_type, entity_id, action, actor, summary)
           values ('lead', $1, 'archived', $2, 'Archived from Lead Management')`,
          [id, email]
        );
      }
    });

    return NextResponse.json({ success: true, archived: leadIds.length });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
