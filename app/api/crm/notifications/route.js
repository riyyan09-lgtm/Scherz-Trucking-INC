import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";
import { listNotifications, markRead, markAllRead } from "../../../../lib/notifications";

export const dynamic = "force-dynamic";

// GET /api/crm/notifications?unread=1  -> agent's notifications
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
    const rows = await listNotifications(pool, agent.id, { unreadOnly });
    const { rows: counts } = await pool.query(
      `select count(*)::int as unread from notifications where agent_id = $1 and read = false`,
      [agent.id]
    );
    return NextResponse.json({ notifications: rows, unread: counts[0]?.unread ?? 0 });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

// PATCH /api/crm/notifications  body: { id? }  -> mark one (or all if id omitted) read
export async function PATCH(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    let body = {};
    try { body = await request.json(); } catch { body = {}; }
    if (body.id) await markRead(pool, agent.id, Number(body.id));
    else await markAllRead(pool, agent.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
