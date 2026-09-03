import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

const CONVERTED = ["booked", "dispatched", "delivered", "closed"];

// GET /api/portal/lead-management/leads?agent_id=<id|unassigned>&filter=<...>&search=<...>
// Powers the "View Leads" table: every lead currently assigned to one agent
// (or the Unassigned queue), with the columns/filters/search the Lead
// Management page needs.
export async function GET(request) {
  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    const url = new URL(request.url);
    const agentParam = url.searchParams.get("agent_id");
    const filter = url.searchParams.get("filter") || "all";
    const search = (url.searchParams.get("search") || "").trim();

    const where = ["l.tenant_id = $1"];
    const vals = [tenant.id];
    if (agentParam === "unassigned") {
      where.push("l.assigned_agent_id is null");
    } else {
      const agentId = Number(agentParam);
      if (!agentId) return NextResponse.json({ error: "agent_id or 'unassigned' required" }, { status: 400 });
      const owned = await pool.query(`select id from agents where id = $1 and tenant_id = $2`, [agentId, tenant.id]);
      if (owned.rows.length === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      vals.push(agentId);
      where.push(`l.assigned_agent_id = $${vals.length}`);
    }

    if (filter === "untouched") where.push("l.status in ('new','assigned') and l.last_contacted is null");
    else if (filter === "contacted") where.push("l.status = 'contacted'");
    else if (filter === "quoted") where.push("l.status = 'quoted'");
    else if (filter === "converted") where.push(`l.status in ('${CONVERTED.join("','")}')`);
    else if (filter === "lost") where.push("l.status = 'dead'");

    if (search) {
      vals.push(`%${search}%`);
      where.push(`(l.name ilike $${vals.length} or l.phone ilike $${vals.length} or l.email ilike $${vals.length})`);
    }

    const { rows } = await pool.query(
      `select l.id, l.name as customer, l.phone, l.email, l.status,
              l.agent_assigned_at, l.last_contacted, l.quoted_at, l.closed_at,
              (select max(sa.created_at) from sales_activity sa where sa.lead_id = l.id) as last_activity
       from leads l
       where ${where.join(" and ")}
       order by l.agent_assigned_at desc nulls last, l.created_at desc
       limit 500`,
      vals
    );

    return NextResponse.json({ leads: rows });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
