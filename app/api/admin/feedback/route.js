import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";
import { createNotification } from "../../../../lib/notifications";

export const dynamic = "force-dynamic";

// GET /api/admin/feedback — all feedback (newest first), for the admin portal.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `select id, tenant_id, agent_id, agent_name, company, subject, message,
              attachments, browser_info, page, crm_version, status, admin_reply,
              replied_at, resolved_at, created_at
       from feedback order by created_at desc limit 200`
    );
    return NextResponse.json({ feedback: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/admin/feedback  body: { id, status?, admin_reply?, notify? }
// status: new | in_progress | resolved | closed
// On reply/resolve/close, notify the submitting agent (if agent_id present).
export async function PATCH(request) {
  const adminEmail = await isAdminRequest(request);
  if (!adminEmail) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide feedback id" }, { status: 400 });

  try {
    const pool = getPool();
    const sets = []; const vals = [];
    const put = (c, v) => { vals.push(v); sets.push(`${c} = $${vals.length}`); };
    if (body.status !== undefined) {
      put("status", body.status);
      if (body.status === "resolved") put("resolved_at", "now()");
    }
    if (body.admin_reply !== undefined) { put("admin_reply", body.admin_reply || null); put("replied_at", "now()"); }
    vals.push(id);
    const upd = await pool.query(
      `update feedback set ${sets.join(", ")} where id = $${vals.length} returning agent_id, agent_name, subject, status`,
      vals
    );
    if (upd.rows.length === 0) return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    const fb = upd.rows[0];

    // Notify the submitting agent on reply / resolve / close.
    if (fb.agent_id && (body.admin_reply || body.status === "resolved" || body.status === "closed")) {
      const note = body.admin_reply
        ? `Admin replied to your feedback "${fb.subject}"`
        : body.status === "resolved"
          ? `Your feedback "${fb.subject}" was resolved`
          : `Your feedback "${fb.subject}" was closed`;
      await createNotification({
        agentId: fb.agent_id,
        kind: "feedback_update",
        payload: { feedback_id: id, subject: fb.subject, status: fb.status, reply: body.admin_reply || null },
      });
    }
    return NextResponse.json({ success: true, feedback: fb });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
