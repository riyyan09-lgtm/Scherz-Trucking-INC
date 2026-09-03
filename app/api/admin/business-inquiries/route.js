import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";
import { isBizStatus } from "../../../../lib/businessStatus";

export const dynamic = "force-dynamic";

// GET /api/admin/business-inquiries — B2B "request a business account" leads.
// These come from the For Business pages (dealers / repair shops / fleet) and
// are stored in their own table (business_inquiries), separate from quote leads.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pool = getPool();
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

// PATCH /api/admin/business-inquiries — update an inquiry's lifecycle status
// so the team can track which B2B leads are contacted / won / lost.
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
  const status = body?.status;
  if (!id) return NextResponse.json({ error: "Provide an inquiry id" }, { status: 400 });
  if (!isBizStatus(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  try {
    const pool = getPool();
    const upd = await pool.query(
      `update business_inquiries set status = $2 where id = $1 returning id, status`,
      [id, status]
    );
    if (upd.rows.length === 0) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 });
    return NextResponse.json({ success: true, id: upd.rows[0].id, status: upd.rows[0].status });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
