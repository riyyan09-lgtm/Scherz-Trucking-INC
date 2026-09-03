import { NextResponse } from "next/server";
import { getPool, withTransaction } from "../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../lib/portalAuth";
import { createNotification } from "../../../../../lib/notifications";

export const dynamic = "force-dynamic";

// POST /api/portal/lead-management/redistribute
// body: { from_agent_id, to_agent_ids: number[], preview?: bool }
// Evenly splits everything currently on `from_agent_id`'s queue (open leads,
// i.e. not 'dead') across `to_agent_ids` — the "Redistribute Queue" action
// for an agent who's off today / on vacation / disabled. preview:true
// computes the split without writing, for the confirm dialog.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const fromAgentId = Number(body?.from_agent_id);
  const toAgentIds = Array.isArray(body?.to_agent_ids) ? body.to_agent_ids.map(Number).filter(Boolean) : [];
  if (!fromAgentId) return NextResponse.json({ error: "from_agent_id required" }, { status: 400 });
  if (toAgentIds.length === 0) return NextResponse.json({ error: "Choose at least one receiving agent" }, { status: 400 });

  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    const allIds = [fromAgentId, ...toAgentIds];
    const agentsRes = await pool.query(
      `select id, name from agents where id = any($1::int[]) and tenant_id = $2`,
      [allIds, tenant.id]
    );
    if (agentsRes.rows.length !== new Set(allIds).size) {
      return NextResponse.json({ error: "One or more agents don't belong to your account" }, { status: 404 });
    }
    const nameOf = Object.fromEntries(agentsRes.rows.map((a) => [a.id, a.name]));

    const leadsRes = await pool.query(
      `select id from leads where assigned_agent_id = $1 and tenant_id = $2 and status <> 'dead' order by agent_assigned_at asc nulls last, id asc`,
      [fromAgentId, tenant.id]
    );
    const leadIds = leadsRes.rows.map((r) => r.id);

    // Round-robin split — deterministic, distributes any remainder across
    // the first few agents rather than dumping it all on the last one.
    const buckets = toAgentIds.map((id) => ({ agent_id: id, name: nameOf[id], lead_ids: [] }));
    leadIds.forEach((id, i) => buckets[i % buckets.length].lead_ids.push(id));

    if (body.preview) {
      return NextResponse.json({
        total: leadIds.length,
        distribution: buckets.map((b) => ({ agent_id: b.agent_id, name: b.name, count: b.lead_ids.length })),
      });
    }

    if (leadIds.length === 0) return NextResponse.json({ success: true, moved: 0 });

    await withTransaction(async (tx) => {
      for (const b of buckets) {
        if (b.lead_ids.length === 0) continue;
        await tx.query(
          `update leads set assigned_agent_id = $1, agent_assigned_at = now()
           where id = any($2::int[]) and tenant_id = $3`,
          [b.agent_id, b.lead_ids, tenant.id]
        );
        for (const leadId of b.lead_ids) {
          await tx.query(
            `insert into activity_log (entity_type, entity_id, action, actor, summary, details)
             values ('lead', $1, 'reassigned', $2, $3, $4)`,
            [
              leadId,
              email,
              `Redistributed to ${b.name} — manager redistribution`,
              JSON.stringify({ from_agent_id: fromAgentId, to_agent_id: b.agent_id, reason: "Manager redistribution" }),
            ]
          );
        }
      }
    });

    for (const b of buckets) {
      if (b.lead_ids.length === 0) continue;
      await createNotification({
        agentId: b.agent_id,
        kind: "lead_reassigned",
        payload: { count: b.lead_ids.length, lead_ids: b.lead_ids, reason: "Manager redistribution" },
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      moved: leadIds.length,
      distribution: buckets.map((b) => ({ agent_id: b.agent_id, name: b.name, count: b.lead_ids.length })),
    });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
