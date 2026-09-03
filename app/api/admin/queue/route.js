import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/queue — pending items first, then recently reviewed.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select id, action_type, target_table, target_id, proposed_action, confidence,
              reasoning, status, reviewed_by, reviewed_at, created_at
       from ai_action_queue
       order by (status = 'pending') desc, coalesce(reviewed_at, created_at) desc
       limit 50`
    );
    return NextResponse.json({ items: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// POST /api/admin/queue — { id, decision: 'approved' | 'rejected' }.
// Approving records the human decision; any real-world execution (e.g.
// actually launching an ad campaign) stays manual — no integration exists.
// Rejecting a campaign-launch proposal returns the campaign to draft.
export async function POST(request) {
  const adminEmail = await isAdminRequest(request);
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body?.id);
  const decision = body?.decision;
  if (!id || !["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Provide id and decision (approved|rejected)" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const upd = await pool.query(
      `update ai_action_queue
       set status = $1, reviewed_by = $2, reviewed_at = now()
       where id = $3 and status = 'pending'
       returning action_type, target_table, target_id`,
      [decision, adminEmail, id]
    );
    if (upd.rows.length === 0) {
      return NextResponse.json({ error: "Item not found or already reviewed" }, { status: 409 });
    }

    const item = upd.rows[0];
    if (decision === "rejected" && item.action_type === "launch_ad_campaign" && item.target_table === "ad_campaigns") {
      await pool.query(`update ad_campaigns set status = 'draft' where id = $1`, [item.target_id]);
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
