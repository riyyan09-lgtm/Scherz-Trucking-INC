import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, withTransaction } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// Tenant portal agent management (CRM-lite). Agents are the tenant's own
// reps (agents.agent_type = 'tenant_internal'). The tenant-level cap —
// "assign at most N leads per rep per day/week" — lives on the tenants row
// and is enforced by /api/portal/assign.

async function requireTenant(request) {
  const email = await getAuthedEmail(request);
  if (!email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const pool = getPool();
  const tenant = await resolveTenant(pool, email);
  if (!tenant) return { error: NextResponse.json({ error: "No tenant account for this login" }, { status: 403 }) };
  return { pool, tenant };
}

function periodStart(period) {
  return period === "week" ? "date_trunc('week', now())" : "date_trunc('day', now())";
}

export async function GET(request) {
  try {
    const { pool, tenant, error } = await requireTenant(request);
    if (error) return error;
    const settings = await pool.query(
      `select agent_lead_cap, agent_cap_period from tenants where id = $1`,
      [tenant.id]
    );
    const period = settings.rows[0].agent_cap_period === "week" ? "week" : "day";
    const agents = await pool.query(
      `select a.id, a.name, a.email, a.phone, a.active, a.availability,
              (select count(*)::int from leads l
                 where l.assigned_agent_id = a.id
                   and l.agent_assigned_at >= ${periodStart(period)}) as assigned_this_period,
              (select count(*)::int from leads l where l.assigned_agent_id = a.id) as assigned_total,
              (select count(*)::int from leads l
                 where l.assigned_agent_id = a.id
                   and l.agent_assigned_at >= date_trunc('week', now())) as assigned_week,
              (select count(*)::int from leads l
                 where l.assigned_agent_id = a.id
                 and l.closed_at >= date_trunc('week', now())) as closed_week,
              (select coalesce(sum(l.sale_amount), 0) from leads l
                 where l.assigned_agent_id = a.id
                   and l.closed_at >= date_trunc('week', now())) as revenue_week,
              -- Broker earnings = broker fees ACTUALLY COLLECTED (confirmed
              -- customer->broker payments), not the fee on booked orders. A fee
              -- that's still Due/Unpaid in the CRM must not count as earned here.
              (select coalesce(sum(p.amount), 0) from payments p
                 join leads l on p.lead_id = l.id
                 where l.assigned_agent_id = a.id
                   and lower(p.direction) = 'customer_broker' and p.confirmed = true
                   and p.payment_date >= date_trunc('week', now())) as broker_week,
              (select coalesce(sum(p.amount), 0) from payments p
                 join leads l on p.lead_id = l.id
                 where l.assigned_agent_id = a.id
                   and lower(p.direction) = 'customer_broker' and p.confirmed = true
                   and p.payment_date >= date_trunc('month', now())) as broker_month,
              (select coalesce(sum(p.amount), 0) from payments p
                 join leads l on p.lead_id = l.id
                 where l.assigned_agent_id = a.id
                   and lower(p.direction) = 'customer_broker' and p.confirmed = true
                   and p.payment_date >= date_trunc('year', now())) as broker_year
       from agents a
       where a.tenant_id = $1 and a.deleted_at is null
       order by a.created_at`,
      [tenant.id]
    );
    // Tenant-wide agent summary cards (refunds/chargebacks this month, orders, earnings).
    const summary = await pool.query(
      `select
         count(*) filter (where l.status IN ('booked','dispatched','delivered','closed') and l.closed_at >= date_trunc('month', now()))::int as orders_converted,
         coalesce(sum(l.total_tariff - coalesce(l.carrier_pay,0)) filter (where l.status IN ('booked','dispatched','delivered','closed')),0) as fees_earned,
         coalesce(sum(l.total_tariff - coalesce(l.carrier_pay,0)) filter (where l.status IN ('booked','dispatched','delivered','closed')),0)
           - coalesce((select sum(p.amount) from payments p join leads l2 on p.lead_id=l2.id
                 where l2.tenant_id = $1 and lower(p.direction)='customer_broker' and p.confirmed=true and (p.refunded is not true)),0)
           - coalesce((select sum(p3.amount) from payments p3 join leads l5 on p3.lead_id=l5.id
                 where l5.tenant_id = $1 and p3.refunded = true),0) as net_earnings,
         (select coalesce(sum(p.amount),0) from payments p join leads l3 on p.lead_id=l3.id
            where l3.tenant_id = $1 and p.refunded=true and (p.refund_type is distinct from 'chargeback')
              and coalesce(p.refund_date, p.payment_date) >= date_trunc('month', now())) as refunds_month,
         (select coalesce(sum(p2.amount),0) from payments p2 join leads l4 on p2.lead_id=l4.id
            where l4.tenant_id = $1 and p2.refunded=true and p2.refund_type='chargeback'
              and coalesce(p2.refund_date, p2.payment_date) >= date_trunc('month', now())) as chargebacks_month
       from leads l where l.tenant_id = $1`,
      [tenant.id]
    );
    const tenantSummary = summary.rows[0] || {};
    return NextResponse.json({
      agents: agents.rows,
      cap: settings.rows[0].agent_lead_cap,
      period,
      tenantSummary: {
        orders_converted: Number(tenantSummary.orders_converted || 0),
        broker_fees_earned: Number(tenantSummary.fees_earned || 0),
        net_earnings: Number(tenantSummary.net_earnings || 0),
        refunds_month: Number(tenantSummary.refunds_month || 0),
        chargebacks_month: Number(tenantSummary.chargebacks_month || 0),
      },
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST { name, email, phone } — add a rep.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.name || !body?.email) {
    return NextResponse.json({ error: "Agent name and email are required" }, { status: 400 });
  }
  if (body.password && String(body.password).length < 8) {
    return NextResponse.json({ error: "Agent password must be at least 8 characters" }, { status: 400 });
  }
  try {
    const { pool, tenant, error } = await requireTenant(request);
    if (error) return error;
    const dup = await pool.query(`select id from agents where lower(email) = lower($1) and deleted_at is null`, [body.email]);
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "An agent with this email already exists" }, { status: 409 });
    }
    const ins = await pool.query(
      `insert into agents (tenant_id, name, email, phone, agent_type, categories)
       values ($1, $2, lower($3), $4, 'tenant_internal', array['car'])
       returning id`,
      [tenant.id, body.name, body.email, body.phone || null]
    );

    // Provision the agent's CRM login (/crm). Shown once in the response.
    let password = null;
    let loginNote = null;
    let customPassword = false;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      customPassword = Boolean(body.password);
      password = body.password
        ? String(body.password)
        : crypto.randomBytes(18).toString("base64").replace(/[/+=]/g, "").slice(0, 20);
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: body.email.toLowerCase(), password, email_confirm: true }),
      });
      if (!res.ok) {
        password = null;
        loginNote = "A login already exists for this email — the agent can use their existing password on /crm.";
      }
    }

    return NextResponse.json({
      success: true,
      agent_id: ins.rows[0].id,
      crm_login: password ? { email: body.email.toLowerCase(), password, custom: customPassword } : null,
      note: loginNote,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH:
//   { id, name?, phone?, active? }        edit one agent
//   { cap: N|null, period: 'day'|'week' } save the tenant-wide cap setting
export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  try {
    const { pool, tenant, error } = await requireTenant(request);
    if (error) return error;

    if (body?.cap !== undefined || body?.period !== undefined) {
      const period = body.period === "week" ? "week" : "day";
      const cap = body.cap ? Number(body.cap) : null;
      if (cap !== null && !(cap > 0 && cap <= 10000)) {
        return NextResponse.json({ error: "Cap must be a positive number" }, { status: 400 });
      }
      await pool.query(`update tenants set agent_lead_cap = $1, agent_cap_period = $2 where id = $3`, [
        cap,
        period,
        tenant.id,
      ]);
      return NextResponse.json({ success: true });
    }

    const id = Number(body?.id);
    if (!id) return NextResponse.json({ error: "Provide an agent id or cap settings" }, { status: 400 });

    // Reset the agent's CRM password (tenant-controlled). Returns it once.
    if (body?.reset_password) {
      const owned = await pool.query(`select email from agents where id = $1 and tenant_id = $2`, [id, tenant.id]);
      if (owned.rows.length === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) return NextResponse.json({ error: "Password reset unavailable" }, { status: 500 });
      const newPassword = body.new_password && String(body.new_password).length >= 8
        ? String(body.new_password)
        : crypto.randomBytes(18).toString("base64").replace(/[/+=]/g, "").slice(0, 20);
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
      const list = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=100`, { headers });
      const users = (await list.json()).users || [];
      const user = users.find((u) => u.email?.toLowerCase() === owned.rows[0].email.toLowerCase());
      if (!user) return NextResponse.json({ error: "No login exists for this agent" }, { status: 404 });
      const res = await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
        method: "PUT", headers, body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) return NextResponse.json({ error: "Could not reset password" }, { status: 502 });
      return NextResponse.json({ success: true, new_password: newPassword });
    }

    const AVAILABILITY = ["active", "busy", "off_today", "vacation", "disabled"];
    if (body.availability !== undefined && !AVAILABILITY.includes(body.availability)) {
      return NextResponse.json({ error: "Invalid availability value" }, { status: 400 });
    }
    const upd = await pool.query(
      `update agents set
         name = coalesce($1, name),
         phone = coalesce($2, phone),
         active = coalesce($3, active),
         availability = coalesce($4, availability)
       where id = $5 and tenant_id = $6 returning id`,
      [body.name || null, body.phone || null, typeof body.active === "boolean" ? body.active : null, body.availability || null, id, tenant.id]
    );
    if (upd.rows.length === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// DELETE { id } — remove a rep; their leads become unassigned.
export async function DELETE(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide an agent id" }, { status: 400 });
  try {
    const { pool, tenant, error } = await requireTenant(request);
    if (error) return error;
    const owned = await pool.query(`select id from agents where id = $1 and tenant_id = $2`, [id, tenant.id]);
    if (owned.rows.length === 0) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    await withTransaction(async (tx) => {
      await tx.query(`update leads set assigned_agent_id = null, agent_assigned_at = null where assigned_agent_id = $1`, [id]);
      await tx.query(`delete from agents where id = $1`, [id]);
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[agents:DELETE] failed:", err);
    return NextResponse.json({ error: `Could not remove agent: ${err.message}` }, { status: 500 });
  }
}
