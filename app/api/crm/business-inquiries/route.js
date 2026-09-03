import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";
import { isBizStatus } from "../../../../lib/businessStatus";

export const dynamic = "force-dynamic";

// GET /api/crm/business-inquiries — B2B "request a business account" leads.
// These come from the For Business pages (dealers / repair shops / fleet) and
// live in their own table (business_inquiries). They're a company-wide inbox,
// not assigned to a specific agent, so any authenticated CRM user can see them.
export async function GET(request) {
  try {
    const pool = getPool();
    const { error, status } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const { rows } = await pool.query(
      `select id, segment, name, company, phone, email, message, status, created_at
       from business_inquiries
       order by created_at desc
       limit 200`
    );
    return NextResponse.json({ inquiries: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/crm/business-inquiries — agents can move a B2B inquiry through its
// lifecycle (new → contacted → in_progress → won/lost) so nothing falls through.
export async function PATCH(request) {
  try {
    const pool = getPool();
    const { error, status } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const id = Number(body?.id);
    const st = body?.status;
    if (!id) return NextResponse.json({ error: "Provide an inquiry id" }, { status: 400 });
    if (!isBizStatus(st)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    const upd = await pool.query(
      `update business_inquiries set status = $2 where id = $1 returning id, status`,
      [id, st]
    );
    if (upd.rows.length === 0) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    return NextResponse.json({ success: true, id: upd.rows[0].id, status: upd.rows[0].status });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
