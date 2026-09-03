import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// GET ?lead_id=  -> agent's vehicles for that lead
// POST          -> create vehicle (any of the spec fields)
// PATCH         -> update { id, ...fields }
// DELETE        -> { id }
const COLS = ["year","make","model","type","vin","running","modified","lift_kit","lowered",
  "oversized_tires","color","plate","lot_number","keys_available","weight","photos","damage_notes",
  "carrier_pay","broker_fee_allocation"];

export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const leadId = new URL(request.url).searchParams.get("lead_id");
    if (!leadId) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    let { rows } = await pool.query(
      `select * from lead_vehicles where lead_id=$1 and tenant_id=$2 order by sort_order, id`,
      [leadId, agent.tenant_id]
    );
    // Self-heal: some leads (landing form / auto-routed) store vehicles only in
    // leads.vehicles JSON and never got synced to lead_vehicles. If the table
    // is empty for this lead, materialize rows from the JSON so the CRM card
    // shows every vehicle — including multi-vehicle leads.
    if (rows.length === 0) {
      const { rows: leadRows } = await pool.query(
        `select vehicles, vehicle_year, vehicle_make, vehicle_model from leads where id=$1 and tenant_id=$2`,
        [leadId, agent.tenant_id]
      );
      const lead = leadRows[0];
      let list = [];
      if (lead) {
        if (Array.isArray(lead.vehicles) && lead.vehicles.length) list = lead.vehicles;
        else if (lead.vehicle_year || lead.vehicle_make || lead.vehicle_model)
          list = [{ year: lead.vehicle_year, make: lead.vehicle_make, model: lead.vehicle_model }];
      }
      if (list.length) {
        try {
          for (let i = 0; i < list.length; i++) {
            const v = list[i];
            const vType = deriveType(v);
            await pool.query(
              `insert into lead_vehicles (lead_id, agent_id, tenant_id, year, make, model, type, running, damage_notes, sort_order)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
              [leadId, agent.id, agent.tenant_id, v.year || null, v.make || null, v.model || null,
               vType, !v.inoperable, v.condition || null, i]
            );
          }
          ({ rows } = await pool.query(
            `select * from lead_vehicles where lead_id=$1 and tenant_id=$2 order by sort_order, id`,
            [leadId, agent.tenant_id]
          ));
        } catch { /* best-effort backfill; fall through with whatever we have */ }
      }
    }
    return NextResponse.json({ vehicles: rows });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

function build(b, agent) {
  const cols = ["lead_id","agent_id","tenant_id"];
  const vals = [b.lead_id, agent.id, agent.tenant_id];
  let i = 4;
  for (const c of COLS) {
    if (b[c] !== undefined) { cols.push(c); vals.push(b[c] === "" ? null : b[c]); i++; }
  }
  return { cols, vals, placeholders: cols.map((_,idx)=>"$"+(idx+1)).join(",") };
}

// Derive a vehicle type from its model/make (used when a quote/lead is created
// without an explicit `type`, so the CRM card always shows a category).
function deriveType(v) {
  if (v && v.type) return v.type;
  const m = String((v && (v.model || v.make)) || "").toLowerCase();
  if (!m) return null;
  if (m.includes("pickup") || m.includes("truck") || /\b(f-1[0-9]0|f150|silverado|sierra|ram|tundra|tacoma|colorado|ranger|frontier|ridgeline|gladiator|titan|maverick)\b/.test(m)) return "Pickup";
  if (m.includes("suv") || m.includes("crossover") || m.includes("4runner") || m.includes("tahoe") || m.includes("suburban") || m.includes("explorer") || m.includes("expedition") || m.includes("highlander") || m.includes("pilot") || m.includes("rav4") || m.includes("cr-v") || m.includes("crv") || m.includes("escape") || m.includes("equinox") || m.includes("rogue") || m.includes("cx-5") || m.includes("cx5") || m.includes("wrangler") || m.includes("cherokee") || m.includes("grand cherokee") || m.includes("bronco") || m.includes("lx") || m.includes("gx") || m.includes("rx") || m.includes("qx") || m.includes("mdx") || m.includes("rdx") || m.includes("xc90") || m.includes("xc60") || m.includes("x5") || m.includes("x3") || m.includes("glc") || m.includes("gle") || m.includes("q5") || m.includes("q7") || m.includes("telluride") || m.includes("palisade") || m.includes("atlas") || m.includes("tucson") || m.includes("santa fe") || m.includes("sorento") || m.includes("sportage") || m.includes("outback") || m.includes("forester") || m.includes("durango") || m.includes("traverse") || m.includes("pathfinder") || m.includes("sequoia") || m.includes("land cruiser") || m.includes("defender") || m.includes("range rover") || m.includes("discovery")) return "SUV";
  if (m.includes("van") || m.includes("minivan") || m.includes("odyssey") || m.includes("sienna") || m.includes("pacifica") || m.includes("caravan") || m.includes("transit") || m.includes("sprinter") || m.includes("express") || m.includes("savana") || m.includes("promaster") || m.includes("carnival") || m.includes("sedona") || m.includes("metris")) return "Van";
  if (m.includes("motorcycle") || m.includes("harley") || m.includes("ninja") || m.includes("cbr") || m.includes("yzf") || m.includes("gsxr") || m.includes("softail") || m.includes("sportster") || m.includes("goldwing") || m.includes("monster")) return "Motorcycle";
  return "Car";
}

export async function POST(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const b = await request.json().catch(() => ({}));
    if (!b.lead_id) return NextResponse.json({ error: "lead_id required" }, { status: 400 });
    // Ensure a type is always set (derive from model when the quote/lead
    // didn't supply one) so the CRM card shows a category.
    const withType = { ...b, type: deriveType(b) };
    const { cols, vals, placeholders } = build(withType, agent);
    const { rows } = await pool.query(
      `insert into lead_vehicles (${cols.join(",")}) values (${placeholders}) returning id`,
      vals
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
    const sets = []; const vals = [agent.tenant_id]; let i = 2;
    for (const c of COLS) {
      if (b[c] !== undefined) { sets.push(`${c}=$${i++}`); vals.push(b[c] === "" ? null : b[c]); }
    }
    if (sets.length === 0) return NextResponse.json({ success: true });
    vals.push(b.id);
    await pool.query(`update lead_vehicles set ${sets.join(", ")} where id=$${vals.length} and tenant_id=$1`, vals);
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
    await pool.query(`delete from lead_vehicles where id=$1 and tenant_id=$2`, [b.id, agent.tenant_id]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
