import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

// Default templates seeded the first time an agent in a tenant opens the Text
// modal (when that tenant has zero templates). They are company-shared
// (agent_id IS NULL) so every agent in the tenant sees them.
// Bodies are single-quoted with explicit \n (NOT template literals) so the
// literal {{placeholders}} are never parsed as JS expressions.
const L = (lines) => lines.join("\n");
const DEFAULTS = [
  { name: "First Quote", body: L([
    "Hi {{customer_name}},",
    "I have your vehicle transport quoted at {{quote_amount}} all-inclusive.",
    "Quote ID: #{{quote_id}}",
    "This includes door-to-door transport with a fully insured carrier.",
    "Reserve your shipment here:",
    "{{booking_link}}",
    "If you have any questions, just reply or give me a call.",
    "Thanks,",
    "{{agent_name}}",
    "{{agent_phone}}",
    "{{company_name}}",
  ]) },
  { name: "Follow Up 1", body: L([
    "Hi {{customer_name}},",
    "Just checking in regarding Quote #{{quote_id}}.",
    "Your current quote is {{quote_amount}}.",
    "Availability changes daily, so if you'd like to reserve your shipment, you can do so here:",
    "{{booking_link}}",
    "Let me know if you have any questions.",
    "{{agent_name}}",
  ]) },
  { name: "Follow Up 2", body: L([
    "Hi {{customer_name}},",
    "Just wanted to follow up regarding your transport quote.",
    "Your current price is still {{quote_amount}}, assuming carrier availability hasn't changed.",
    "Reserve here:",
    "{{booking_link}}",
    "Feel free to text or call anytime.",
    "{{agent_name}}",
    "{{agent_phone}}",
  ]) },
  { name: "Price Drop", body: L([
    "Hi {{customer_name}},",
    "Good news! I found a carrier at {{quote_amount}}.",
    "If you'd like to lock it in before it's gone:",
    "{{booking_link}}",
    "Let me know.",
  ]) },
  { name: "Carrier Assigned", body: L([
    "Hi {{customer_name}},",
    "Great news! Your vehicle has been assigned to a carrier.",
    "Order #: {{order_id}}",
    "Pickup:",
    "{{pickup_date}}",
    "We'll send driver information shortly.",
    "Thanks!",
  ]) },
  { name: "Pickup Reminder", body: L([
    "Hi {{customer_name}},",
    "Just a reminder that your pickup is scheduled for:",
    "{{pickup_date}}",
    "Please have the vehicle accessible and remove personal belongings.",
    "Thanks!",
  ]) },
  { name: "Delivery Reminder", body: L([
    "Hi {{customer_name}},",
    "Your vehicle is expected to arrive around:",
    "{{delivery_date}}",
    "The driver will contact you before arrival.",
    "Thank you!",
  ]) },
  { name: "Payment Reminder", body: L([
    "Hi {{customer_name}},",
    "This is a reminder that your remaining broker balance is:",
    "{{broker_due}}",
    "Thank you!",
  ]) },
  { name: "Thank You", body: L([
    "Thank you for choosing {{company_name}} for your vehicle transport.",
    "We truly appreciate your business.",
    "If you have a moment, we'd greatly appreciate a review.",
    "Safe travels!",
  ]) },
];

async function seedDefaults(pool, tenantId) {
  const { rows } = await pool.query("SELECT count(*)::int n FROM sms_templates WHERE tenant_id = $1", [tenantId]);
  if (rows[0].n > 0) return;
  for (const d of DEFAULTS) {
    await pool.query(
      `INSERT INTO sms_templates (tenant_id, agent_id, category, name, body, is_default)
       VALUES ($1, NULL, 'company', $2, $3, true)`,
      [tenantId, d.name, d.body]
    );
  }
}

// A template is visible to the agent if it's company-shared for their tenant
// OR it's their own personal template.
const VISIBLE = `
  SELECT id, tenant_id, agent_id, category, name, body, is_default, created_at, updated_at
  FROM sms_templates
  WHERE tenant_id = $1 AND (agent_id IS NULL OR agent_id = $2)
  ORDER BY category, name`;

export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    await seedDefaults(pool, agent.tenant_id);
    const { rows } = await pool.query(VISIBLE, [agent.tenant_id, agent.id]);
    return NextResponse.json({ templates: rows });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const name = String(body?.name || "").trim();
  const text = String(body?.body || "");
  const category = body?.category === "personal" ? "personal" : "company";
  if (!name || !text) return NextResponse.json({ error: "Name and message body are required" }, { status: 400 });
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    // Personal templates bind to the agent; company templates are shared (NULL).
    const agentId = category === "personal" ? agent.id : null;
    const { rows } = await pool.query(
      `INSERT INTO sms_templates (tenant_id, agent_id, category, name, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, tenant_id, agent_id, category, name, body, is_default, created_at, updated_at`,
      [agent.tenant_id, agentId, category, name, text]
    );
    return NextResponse.json({ template: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

// Ownership check: personal templates must belong to the agent; company
// templates must belong to the agent's tenant (shared). Prevents cross-tenant
// or cross-agent edits.
async function owned(pool, id, agent) {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, agent_id, category FROM sms_templates WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  const t = rows[0];
  if (t.tenant_id !== agent.tenant_id) return null;
  if (t.category === "personal" && t.agent_id !== agent.id) return null;
  return t;
}

export async function PATCH(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide template id" }, { status: 400 });
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    if (!await owned(pool, id, agent)) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    const sets = [];
    const vals = [];
    if (body.name != null) { vals.push(String(body.name)); sets.push(`name = $${vals.length}`); }
    if (body.body != null) { vals.push(String(body.body)); sets.push(`body = $${vals.length}`); }
    if (body.category != null) { const c = body.category === "personal" ? "personal" : "company"; vals.push(c); sets.push(`category = $${vals.length}`); if (c === "company") sets.push(`agent_id = NULL`); else { vals.push(agent.id); sets.push(`agent_id = $${vals.length}`); } }
    if (sets.length === 0) return NextResponse.json({ success: true });
    vals.push(id);
    await pool.query(`UPDATE sms_templates SET ${sets.join(", ")}, updated_at = now() WHERE id = $${vals.length}`, vals);
    const { rows } = await pool.query(VISIBLE + " AND id = $3", [agent.tenant_id, agent.id, id]);
    return NextResponse.json({ template: rows[0] });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

export async function DELETE(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide template id" }, { status: 400 });
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    if (!await owned(pool, id, agent)) return NextResponse.json({ error: "Template not found" }, { status: 404 });
    await pool.query("DELETE FROM sms_templates WHERE id = $1", [id]);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
