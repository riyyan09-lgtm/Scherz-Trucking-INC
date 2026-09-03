import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool, withTransaction } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";
import { logActivity } from "../../../../lib/audit";

export const dynamic = "force-dynamic";

// GET /api/admin/tenants — list all tenants with plan config and usage counts.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select t.id, t.company_name, t.contact_email, t.contact_phone,
              t.plan_type, t.plan_tier, t.status, t.receiving_leads, t.created_at, t.updated_at, t.created_by, t.updated_by,
              tc.page_allowance, tc.leads_per_day, tc.lead_cap, tc.price_per_lead, tc.monthly_price,
              (select count(*)::int from pages p where p.tenant_id = t.id) as pages_count,
              (select coalesce(json_agg(json_build_object('id', p2.id, 'city', c2.name, 'state', s2.abbreviation) order by c2.name), '[]'::json)
                 from pages p2
                 join cities c2 on p2.location_city_id = c2.id
                 join states s2 on c2.state_id = s2.id
                 where p2.tenant_id = t.id) as pages,
              (select count(*)::int from leads l where l.tenant_id = t.id
                 and l.created_at >= date_trunc('month', now())) as leads_month
       from tenants t
       left join tenant_categories tc on tc.tenant_id = t.id
       where t.deleted_at is null
       order by t.created_at desc`
    );
    return NextResponse.json({ tenants: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/admin/tenants — create a tenant + car-shipping plan config, and
// provision their /portal login (Supabase Auth user with a generated
// password, returned exactly once in this response).
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { company_name, contact_email, contact_phone, plan_type, plan_tier, portal_password } = body;
  if (!company_name || !contact_email || !["blue_pill", "red_pill"].includes(plan_type)) {
    return NextResponse.json(
      { error: "company_name, contact_email, and a valid plan_type are required" },
      { status: 400 }
    );
  }
  if (portal_password && String(portal_password).length < 8) {
    return NextResponse.json({ error: "Portal password must be at least 8 characters" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const dup = await pool.query(`select id from tenants where lower(contact_email) = lower($1) and deleted_at is null`, [contact_email]);
    if (dup.rows.length > 0) {
      return NextResponse.json({ error: "A tenant with this contact email already exists" }, { status: 409 });
    }

    const tenant = await withTransaction(async (tx) => {
      const t = await tx.query(
        `insert into tenants (company_name, contact_email, contact_phone, plan_type, plan_tier, created_by)
         values ($1, lower($2), $3, $4, $5, $6) returning id`,
        [company_name, contact_email, contact_phone || null, plan_type, plan_tier || "starter", who || null]
      );
      const svc = await tx.query(`select id from services where slug = 'car-shipping'`);
      await tx.query(
        `insert into tenant_categories (tenant_id, service_id, page_allowance, leads_per_day, lead_cap, price_per_lead, monthly_price, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          t.rows[0].id,
          svc.rows[0].id,
          plan_type === "blue_pill" ? Number(body.page_allowance) || 25 : null,
          plan_type === "red_pill" ? Number(body.leads_per_day) || 5 : null,
          plan_type === "red_pill" ? Number(body.lead_cap) || 100 : null,
          plan_type === "red_pill" && body.price_per_lead ? Number(body.price_per_lead) : null,
          body.monthly_price ? Number(body.monthly_price) : null,
          who || null,
        ]
      );
      return t;
    });

    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: tenant.rows[0].id,
      action: "created",
      summary: `Created tenant "${company_name}" (${plan_type}).`,
      actor: who,
      request,
    });

    // Provision the portal login. Failure here doesn't roll back the tenant --
    // the admin can retry by deleting and recreating, or add the user later.
    let password = null;
    let usedCustomPassword = false;
    let loginNote = null;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      usedCustomPassword = Boolean(portal_password);
      password = portal_password
        ? String(portal_password)
        : crypto.randomBytes(18).toString("base64").replace(/[/+=]/g, "").slice(0, 20);
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: contact_email.toLowerCase(), password, email_confirm: true }),
      });
      if (!res.ok) {
        password = null;
        loginNote =
          res.status === 422 || res.status === 409
            ? "A login already exists for this email — the tenant can use their existing password."
            : "Tenant created, but the portal login could not be provisioned — try delete + recreate.";
      }
    } else {
      loginNote = "SUPABASE_SERVICE_ROLE_KEY is not set — portal login was not provisioned.";
    }

    return NextResponse.json({
      success: true,
      tenant_id: tenant.rows[0].id,
      portal_login: password ? { email: contact_email.toLowerCase(), password, custom: usedCustomPassword } : null,
      note: loginNote,
    });
  } catch (err) {
    console.error("[tenants:POST] create failed:", err);
    return NextResponse.json({ error: `Could not create tenant: ${err.message}` }, { status: 500 });
  }
}
