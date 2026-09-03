import crypto from "crypto";
import { NextResponse } from "next/server";
import { getPool, withTransaction } from "../../../../../lib/db";
import { isAdminRequest } from "../../../../../lib/adminAuth";
import { logActivity } from "../../../../../lib/audit";

export const dynamic = "force-dynamic";

// PATCH /api/admin/tenants/:id — edit fields, change plan config, or
// activate/suspend. Suspending also pauses tenant_categories, which is what
// lib/routing.js checks — a suspended blue tenant's leads overflow to the
// marketplace, and a suspended red tenant stops receiving drops.
export async function PATCH(request, { params }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const existing = await pool.query(`select id, plan_type, company_name, status, contact_email from tenants where id = $1 and deleted_at is null`, [id]);
    if (existing.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const planType = existing.rows[0].plan_type;

    // Reset the tenant's own /portal login password (separate from resetting
    // one of their agents' CRM passwords, which the tenant does themselves).
    // Same pattern as the agent reset in /api/portal/agents: look the user up
    // by email via the Supabase Admin API and set a new password directly.
    if (body.reset_password) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!serviceKey) return NextResponse.json({ error: "Password reset unavailable" }, { status: 500 });
      const newPassword = body.new_password && String(body.new_password).length >= 8
        ? String(body.new_password)
        : crypto.randomBytes(18).toString("base64").replace(/[/+=]/g, "").slice(0, 20);
      const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
      const list = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=100`, { headers });
      const users = (await list.json()).users || [];
      const user = users.find((u) => u.email?.toLowerCase() === existing.rows[0].contact_email.toLowerCase());
      if (!user) return NextResponse.json({ error: "No portal login exists for this tenant" }, { status: 404 });
      const res = await fetch(`${base}/auth/v1/admin/users/${user.id}`, {
        method: "PUT", headers, body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) return NextResponse.json({ error: "Could not reset password" }, { status: 502 });
      await logActivity(pool, {
        entity_type: "tenant",
        entity_id: id,
        action: "password_reset",
        summary: `Reset portal login password for tenant "${existing.rows[0].company_name}".`,
        actor: who,
        request,
      });
      return NextResponse.json({ success: true, new_password: newPassword });
    }

    const fields = [];
    const values = [];
    const push = (col, val) => { values.push(val); fields.push(`${col} = $${values.length}`); };
    if (body.company_name) push("company_name", body.company_name);
    if (body.contact_phone !== undefined) push("contact_phone", body.contact_phone || null);
    if (body.plan_tier) push("plan_tier", body.plan_tier);
    if (body.receiving_leads !== undefined) push("receiving_leads", !!body.receiving_leads);
    if (["active", "suspended"].includes(body.status)) push("status", body.status);
    if (fields.length > 0) {
      values.push(who || null);
      values.push(id);
      await pool.query(`update tenants set ${fields.join(", ")}, updated_by = $${values.length - 1} where id = $${values.length}`, values);
    }

    if (["active", "suspended"].includes(body.status)) {
      await pool.query(
        `update tenant_categories set status = $1, cancelled_at = null where tenant_id = $2`,
        [body.status === "active" ? "active" : "paused", id]
      );
    }

    if (planType === "blue_pill" && body.page_allowance !== undefined) {
      await pool.query(`update tenant_categories set page_allowance = $1 where tenant_id = $2`, [
        Number(body.page_allowance) || null,
        id,
      ]);
    }
    if (
      planType === "red_pill" &&
      (body.leads_per_day !== undefined || body.lead_cap !== undefined || body.price_per_lead !== undefined)
    ) {
      await pool.query(
        `update tenant_categories set
           leads_per_day = coalesce($1, leads_per_day),
           lead_cap = coalesce($2, lead_cap),
           price_per_lead = coalesce($3, price_per_lead)
         where tenant_id = $4`,
        [
          body.leads_per_day ? Number(body.leads_per_day) : null,
          body.lead_cap ? Number(body.lead_cap) : null,
          body.price_per_lead ? Number(body.price_per_lead) : null,
          id,
        ]
      );
    }

    const changed = [];
    if (body.status && body.status !== existing.rows[0].status) changed.push(`status ${existing.rows[0].status}→${body.status}`);
    if (body.company_name) changed.push("company name");
    if (body.contact_phone !== undefined) changed.push("phone");
    if (body.plan_tier) changed.push(`tier→${body.plan_tier}`);
    if (body.receiving_leads !== undefined) changed.push(`receiving leads→${body.receiving_leads ? "on" : "off"}`);
    if (planType === "blue_pill" && body.page_allowance !== undefined) changed.push(`page allowance→${body.page_allowance}`);
    if (planType === "red_pill" && (body.leads_per_day !== undefined || body.lead_cap !== undefined || body.price_per_lead !== undefined))
      changed.push("red-pill pricing");

    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: id,
      action: "updated",
      summary: `Updated tenant "${existing.rows[0].company_name}"${changed.length ? `: ${changed.join(", ")}` : ""}.`,
      actor: who,
      request,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// DELETE /api/admin/tenants/:id — FULL purge. Removing a tenant deletes the
// tenant, its agents, config, carriers, notifications, and its activity-log
// history, and frees the contact email/name/phone for immediate reuse (the
// admin's remove-and-re-add workflow). Pages return to the platform and leads
// are detached (form submissions belong to the platform, not the tenant).
// One fresh activity entry records that the purge happened.
export async function DELETE(request, { params }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });

  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const existing = await pool.query(`select id, company_name, contact_email from tenants where id = $1 and deleted_at is null`, [id]);
    if (existing.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const name = existing.rows[0].company_name;
    const email = existing.rows[0].contact_email.toLowerCase();
    const agentEmails = (
      await pool.query(`select lower(email) as email from agents where tenant_id = $1`, [id])
    ).rows.map((r) => r.email);

    await withTransaction(async (tx) => {
      // Pages and leads return to the platform (they aren't the tenant's data).
      await tx.query(`update pages set tenant_id = null where tenant_id = $1`, [id]);
      await tx.query(
        `update leads set assigned_agent_id = null, agent_assigned_at = null
         where assigned_agent_id in (select id from agents where tenant_id = $1)`,
        [id]
      );
      await tx.query(`update leads set tenant_id = null where tenant_id = $1`, [id]);
      // Purge everything that IS the tenant's data (dependents first), and
      // detach lead-owned rows that merely reference the tenant's agents, so
      // the email/name/phone are immediately reusable for a fresh tenant.
      // NOTE: no .catch() inside the transaction — one failed statement aborts
      // the whole tx, and swallowing it would poison every statement after.
      const agentIds = `select id from agents where tenant_id = $1`;
      // Tenant work-product on leads → delete.
      await tx.query(`delete from notifications where agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from crm_tasks where tenant_id = $1 or agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from crm_notes where tenant_id = $1 or agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from sales_activity where tenant_id = $1 or agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from lead_assignments where agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from lead_documents where tenant_id = $1 or agent_id in (${agentIds})`, [id]);
      // lead_vehicles.agent_id is NOT NULL, so these CRM vehicle rows can't be
      // detached — delete them. The customer's original vehicle submission is
      // preserved on leads.vehicles (jsonb), so no lead data is lost.
      await tx.query(`delete from lead_vehicles where tenant_id = $1 or agent_id in (${agentIds})`, [id]);
      // These also declare agent_id NOT NULL, so the rows cannot be detached —
      // they are the purged agents' own CRM history and go with them. The
      // customer-facing record (leads row, incl. signature + booking fields)
      // is untouched, so nothing the platform needs is lost.
      await tx.query(`delete from change_log where agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from pricing_history where agent_id in (${agentIds})`, [id]);
      await tx.query(`delete from booking_events where agent_id in (${agentIds})`, [id]);
      // Tenant-owned records → delete.
      await tx.query(`delete from lead_carriers where carrier_id in (select id from carriers where tenant_id = $1)`, [id]);
      await tx.query(`delete from carriers where tenant_id = $1`, [id]);
      await tx.query(`delete from ad_campaigns where tenant_id = $1`, [id]);
      await tx.query(`delete from agents where tenant_id = $1`, [id]);
      await tx.query(`delete from tenant_categories where tenant_id = $1`, [id]);
      await tx.query(`delete from tenants where id = $1`, [id]);
      await tx.query(`delete from activity_log where entity_type = 'tenant' and entity_id = $1`, [id]);
    });

    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: null,
      action: "purged",
      summary: `Deleted tenant "${name}" and all its data (agents, config, history). Pages and leads returned to the platform.`,
      actor: who,
      request,
    });

    // Best-effort removal of the portal login (admin can also do it in Supabase).
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let loginDeleted = false;
    if (serviceKey) {
      try {
        const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const headers = { apikey: `${serviceKey}`, Authorization: `Bearer ${serviceKey}` };
        const list = await fetch(`${base}/auth/v1/admin/users?page=1&per_page=100`, { headers });
        const data = await list.json();
        const doomed = new Set([email, ...agentEmails]);
        for (const user of data.users || []) {
          if (user.email && doomed.has(user.email.toLowerCase())) {
            const del = await fetch(`${base}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers });
            if (user.email.toLowerCase() === email) loginDeleted = del.ok;
          }
        }
      } catch {
        // leave loginDeleted false
      }
    }

    return NextResponse.json({ success: true, purged: true, login_deleted: loginDeleted });
  } catch (err) {
    // withTransaction already rolled back. Log the real cause and return it —
    // a bare "Database unavailable" hid a NOT NULL violation here for hours.
    console.error("[tenants:DELETE] purge failed:", err);
    return NextResponse.json(
      { error: `Could not delete tenant: ${err.message}` },
      { status: 500 }
    );
  }
}
