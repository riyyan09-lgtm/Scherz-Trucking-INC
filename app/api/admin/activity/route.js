import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { isAdminRequest } from "../../../../lib/adminAuth";

export const dynamic = "force-dynamic";

// GET /api/admin/activity — the platform-wide timeline (Phase 1 activity log).
// Supports ?entity_type=tenant&entity_id=12 to scope to one record's history.
export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");
  try {
    const pool = getPool();
    const where = [];
    const params = [];
    if (entityType) {
      params.push(entityType);
      where.push(`entity_type = $${params.length}`);
    }
    if (entityId) {
      params.push(Number(entityId));
      where.push(`entity_id = $${params.length}`);
    }
    const clause = where.length ? `where ${where.join(" and ")}` : "";
    const { rows } = await pool.query(
      `select id, entity_type, entity_id, action, actor, summary, details, created_at
       from activity_log
       ${clause}
       order by created_at desc
       limit 100`,
      params
    );
    return NextResponse.json({ activity: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
