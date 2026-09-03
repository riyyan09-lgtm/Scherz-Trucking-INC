import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> agent's tasks for that lead
// POST          -> create { lead_id, title, type?, due_date?, priority?, assigned_user?, reminder?, status?, description?, recurring? }
// PATCH         -> update { id, done?, title?, type?, due_date?, priority?, assigned_user?, reminder?, status?, description?, recurring? }
// DELETE        -> { id }
export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    const { rows } = await pool.query(
      `select id, lead_id, title, type, due_date, priority, done, done_at, created_at
         from crm_tasks where lead_id = $1 and agent_id = $2 order by done, due_date nulls last, created_at desc`,
      [leadId, agent.id]
    );
    return NextResponse.json({ tasks: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.lead_id || !b.title) return NextResponse.json({ error: "lead_id and title required" }, { status: 400 });
    const { rows } = await pool.query(
      `insert into crm_tasks (lead_id, agent_id, tenant_id, title, type, due_date, priority, assigned_user, reminder, status, description, recurring)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
      [b.lead_id, agent.id, agent.tenant_id, b.title, b.type || "call", b.due_date || null, b.priority || "normal",
       b.assigned_user || null, b.reminder || null, b.status || "open", b.description || null, b.recurring || "none"]
    );
    return NextResponse.json({ success: true, id: rows[0].id });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function PATCH(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sets = [];
    const vals = [agent.id];
    let i = 2;
    if (b.title !== undefined) { sets.push(`title=$${i++}`); vals.push(b.title); }
    if (b.type !== undefined) { sets.push(`type=$${i++}`); vals.push(b.type); }
    if (b.due_date !== undefined) { sets.push(`due_date=$${i++}`); vals.push(b.due_date || null); }
    if (b.priority !== undefined) { sets.push(`priority=$${i++}`); vals.push(b.priority); }
    if (b.assigned_user !== undefined) { sets.push(`assigned_user=$${i++}`); vals.push(b.assigned_user || null); }
    if (b.reminder !== undefined) { sets.push(`reminder=$${i++}`); vals.push(b.reminder || null); }
    if (b.status !== undefined) { sets.push(`status=$${i++}`); vals.push(b.status); }
    if (b.description !== undefined) { sets.push(`description=$${i++}`); vals.push(b.description || null); }
    if (b.recurring !== undefined) { sets.push(`recurring=$${i++}`); vals.push(b.recurring || "none"); }
    if (b.done !== undefined) { sets.push(`done=$${i++}`); sets.push(`done_at=case when $${i} then now() else null end`); vals.push(b.done); }
    if (sets.length === 0) return NextResponse.json({ success: true });
    vals.push(b.id);
    await pool.query(
      `update crm_tasks set ${sets.join(", ")} where id=$${vals.length} and agent_id=$1`,
      vals
    );
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function DELETE(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await pool.query(`delete from crm_tasks where id=$1 and agent_id=$2`, [b.id, agent.id]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
