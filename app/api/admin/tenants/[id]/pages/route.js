import { NextResponse } from "next/server";
import { getPool } from "../../../../../../lib/db";
import { isAdminRequest } from "../../../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// Page assignment for blue-pill (software) tenants — they own their pages.
// Red-pill tenants must never own pages (see CLAUDE.md: keep the two plan
// paths structurally separate), enforced here.

async function assertBluePill(pool, id) {
  const t = await pool.query(`select plan_type from tenants where id = $1`, [id]);
  if (t.rows.length === 0) return "Tenant not found";
  if (t.rows[0].plan_type !== "blue_pill") return "Only software-plan (blue pill) tenants can own pages";
  return null;
}

// GET — three modes for the assign-pages browser:
//   ?states=1   list states with how many unowned published pages each has
//   ?state=TX   list every unowned published page in that state
//   ?q=city     free-text city search (kept for convenience)
export async function GET(request, { params }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  try {
    const pool = getPool();

    if (url.searchParams.get("states")) {
      const { rows } = await pool.query(
        `select s.abbreviation as abbr, s.name, count(p.id)::int as available
         from pages p
         join cities c on p.location_city_id = c.id
         join states s on c.state_id = s.id
         join services sv on p.service_id = sv.id
         where sv.slug = 'car-shipping' and p.status = 'published' and p.tenant_id is null
         group by s.abbreviation, s.name
         order by s.name`
      );
      return NextResponse.json({ states: rows });
    }

    const state = url.searchParams.get("state");
    if (state) {
      const { rows } = await pool.query(
        `select p.id, c.name as city, s.abbreviation as state
         from pages p
         join cities c on p.location_city_id = c.id
         join states s on c.state_id = s.id
         join services sv on p.service_id = sv.id
         where sv.slug = 'car-shipping' and p.status = 'published' and p.tenant_id is null
           and lower(s.abbreviation) = lower($1)
         order by c.population desc nulls last`,
        [state]
      );
      return NextResponse.json({ results: rows });
    }

    const q = url.searchParams.get("q") || "";
    if (q.length < 2) return NextResponse.json({ results: [] });
    const { rows } = await pool.query(
      `select p.id, c.name as city, s.abbreviation as state
       from pages p
       join cities c on p.location_city_id = c.id
       join states s on c.state_id = s.id
       join services sv on p.service_id = sv.id
       where sv.slug = 'car-shipping' and p.status = 'published' and p.tenant_id is null
         and c.name ilike $1
       order by c.population desc nulls last
       limit 12`,
      [`%${q}%`]
    );
    return NextResponse.json({ results: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST { page_id } — assign one unowned page to this tenant.
// POST { state: "TX", all: true } — assign every unowned published
// car-shipping page in that state at once (the whole-state toggle).
export async function POST(request, { params }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });

  try {
    const pool = getPool();
    const err = await assertBluePill(pool, id);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    // POST { all_states: true } — assign every unowned published car-shipping
    // page platform-wide (the "All states" option in the assign dropdown).
    if (body?.all_states) {
      const upd = await pool.query(
        `update pages p set tenant_id = $1
         from services sv
         where p.service_id = sv.id
           and sv.slug = 'car-shipping' and p.status = 'published' and p.tenant_id is null
         returning p.id`,
        [id]
      );
      return NextResponse.json({ success: true, assigned: upd.rows.length });
    }

    if (body?.all && body?.state) {
      const upd = await pool.query(
        `update pages p set tenant_id = $1
         from cities c, states s, services sv
         where p.location_city_id = c.id and c.state_id = s.id and p.service_id = sv.id
           and sv.slug = 'car-shipping' and p.status = 'published' and p.tenant_id is null
           and lower(s.abbreviation) = lower($2)
         returning p.id`,
        [id, String(body.state)]
      );
      return NextResponse.json({ success: true, assigned: upd.rows.length });
    }

    const pageId = Number(body?.page_id);
    if (!pageId) return NextResponse.json({ error: "Provide page_id, or state + all" }, { status: 400 });
    const upd = await pool.query(
      `update pages set tenant_id = $1 where id = $2 and tenant_id is null returning id`,
      [id, pageId]
    );
    if (upd.rows.length === 0) {
      return NextResponse.json({ error: "Page not found or already owned" }, { status: 409 });
    }
    return NextResponse.json({ success: true, assigned: 1 });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// DELETE { page_id } — return one of this tenant's pages to the platform.
// DELETE { state: "TX", all: true } — return every page the tenant owns in
// that state (the state-cell "Return whole state" action).
export async function DELETE(request, { params }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number(params.id);
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });
  try {
    const pool = getPool();

    if (body?.all && body?.state) {
      const upd = await pool.query(
        `update pages p set tenant_id = null
         from cities c, states s
         where p.location_city_id = c.id and c.state_id = s.id
           and p.tenant_id = $1 and lower(s.abbreviation) = lower($2)
         returning p.id`,
        [id, String(body.state)]
      );
      return NextResponse.json({ success: true, returned: upd.rows.length });
    }

    const pageId = Number(body?.page_id);
    if (!pageId) return NextResponse.json({ error: "Provide page_id, or state + all" }, { status: 400 });
    const upd = await pool.query(
      `update pages set tenant_id = null where id = $1 and tenant_id = $2 returning id`,
      [pageId, id]
    );
    if (upd.rows.length === 0) {
      return NextResponse.json({ error: "Page does not belong to this tenant" }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
