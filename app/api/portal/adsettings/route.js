import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../lib/portalAuth";

export const dynamic = "force-dynamic";

// Self-managed ads ("I have my own ad manager"). The tenant pastes their ad
// manager's tag IDs; those tags are then rendered ONLY on landing pages this
// tenant owns. Scherz Trucking INC never runs or spends on these campaigns — the manager
// runs them in their own ad account.

async function requireTenant(request) {
  const email = await getAuthedEmail(request);
  if (!email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const pool = getPool();
  const tenant = await resolveTenant(pool, email);
  if (!tenant) return { error: NextResponse.json({ error: "No tenant account for this login" }, { status: 403 }) };
  return { pool, tenant };
}

// Basic shape checks so a typo'd or malicious value can never inject script:
// each ID is later interpolated into a tag, so restrict to the vendor formats.
const PATTERNS = {
  ga4_id: /^G-[A-Z0-9]{4,20}$/i,
  gads_conversion_id: /^AW-\d{6,15}$/i,
  gads_conversion_label: /^[A-Za-z0-9_-]{4,40}$/,
  meta_pixel_id: /^\d{6,20}$/,
};

export async function GET(request) {
  try {
    const { pool, tenant, error } = await requireTenant(request);
    if (error) return error;
    const { rows } = await pool.query(
      `select ga4_id, gads_conversion_id, gads_conversion_label, meta_pixel_id
       from tenants where id = $1`,
      [tenant.id]
    );
    return NextResponse.json({ settings: rows[0] || {} });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH { ga4_id?, gads_conversion_id?, gads_conversion_label?, meta_pixel_id? }
// Empty string clears a field.
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

    const sets = [];
    const vals = [];
    for (const field of Object.keys(PATTERNS)) {
      if (body[field] === undefined) continue;
      const raw = String(body[field]).trim();
      if (raw && !PATTERNS[field].test(raw)) {
        return NextResponse.json({ error: `"${raw}" doesn't look like a valid ${field.replace(/_/g, " ")}` }, { status: 400 });
      }
      vals.push(raw || null);
      sets.push(`${field} = $${vals.length}`);
    }
    if (sets.length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    vals.push(tenant.id);
    await pool.query(`update tenants set ${sets.join(", ")} where id = $${vals.length}`, vals);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
