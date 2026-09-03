import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";
import { autoAssignLead } from "../../../../lib/autoAssign";

export const dynamic = "force-dynamic";

const LEAD_STATUSES = ["new", "assigned", "claimed", "contacted", "quoted", "booked", "closed", "dead"];

// GET /api/admin/leads — latest 100 leads with full context.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select l.id, l.name, l.phone, l.email, l.status, l.routing_mode, l.overflow_reason, l.tenant_id,
              l.origin_city, l.origin_state, l.origin_zip,
              l.destination_city, l.destination_state, l.destination_zip,
              l.pickup_date, l.vehicle_year, l.vehicle_make, l.vehicle_model, l.vehicles, l.created_at,
              p.url_slug, t.company_name as tenant_name, ag.name as agent_name
       from leads l
       left join pages p on l.source_page_id = p.id
       left join tenants t on l.tenant_id = t.id
       left join agents ag on l.assigned_agent_id = ag.id
       order by l.created_at desc
       limit 100`
    );
    const tenants = await pool.query(
      `select id, company_name, plan_type, status from tenants order by company_name`
    );
    return NextResponse.json({ leads: rows, statuses: LEAD_STATUSES, tenants: tenants.rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/admin/leads — worklist management:
//   { id, status }                update the workflow status
//   { id, assign_tenant_id }      hand the lead to a tenant (number), or
//                                 back in-house (null/""). Assignment also
//                                 sets routing_mode and bumps status new →
//                                 assigned so the tenant portal shows it.
export async function PATCH(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide a lead id" }, { status: 400 });
  const hasStatus = body?.status !== undefined;
  const hasAssign = body?.assign_tenant_id !== undefined;
  if (!hasStatus && !hasAssign) {
    return NextResponse.json({ error: "Provide status or assign_tenant_id" }, { status: 400 });
  }
  if (hasStatus && !LEAD_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const pool = getPool();

    if (hasAssign) {
      const tenantId = body.assign_tenant_id ? Number(body.assign_tenant_id) : null;
      if (tenantId) {
        const t = await pool.query(`select id from tenants where id = $1`, [tenantId]);
        if (t.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
      }
      const upd = await pool.query(
        `update leads set
           tenant_id = $1::int,
           routing_mode = $2,
           assigned_agent_id = null,
           agent_assigned_at = null,
           status = case when status = 'new' and $1::int is not null then 'assigned' else status end
         where id = $3 returning id`,
        [tenantId, tenantId ? "tenant" : "in_house", id]
      );
      if (upd.rows.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
      // Hand the lead straight to the tenant's next rep in rotation.
      if (tenantId) await autoAssignLead(pool, id, tenantId);
    }

    if (hasStatus) {
      const upd = await pool.query(`update leads set status = $1 where id = $2 returning id`, [body.status, id]);
      if (upd.rows.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
