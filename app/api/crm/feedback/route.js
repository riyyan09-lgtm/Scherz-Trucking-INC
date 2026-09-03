import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = [
  "image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf",
];
const MAX_ATTACH = 5;
const MAX_BYTES = 6 * 1024 * 1024; // 6MB per attachment (base64 inflates ~33%)

// POST /api/crm/feedback  — agents/tenants submit feedback, bug reports, ideas.
export async function POST(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    let body;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    const subject = String(body.subject || "").trim();
    const message = String(body.message || "").trim();
    if (!subject || !message) return NextResponse.json({ error: "Subject and message are required" }, { status: 400 });

    // Validate + normalize attachments (data URLs).
    let attachments = [];
    if (Array.isArray(body.attachments)) {
      for (const a of body.attachments.slice(0, MAX_ATTACH)) {
        const mime = a?.type || "";
        const dataUrl = a?.data_url || "";
        if (!ALLOWED_MIME.includes(mime)) continue;
        const comma = dataUrl.indexOf(",");
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const approxBytes = Math.floor(b64.length * 0.75);
        if (approxBytes > MAX_BYTES) continue;
        attachments.push({ name: String(a.name || "attachment").slice(0, 200), type: mime, data_url: dataUrl.slice(0, 8 * 1024 * 1024) });
      }
    }

    const browserInfo = String(body.browser_info || "").slice(0, 1000);
    const page = String(body.page || "").slice(0, 500);
    const crmVersion = String(body.crm_version || "").slice(0, 50);

    const ins = await pool.query(
      `insert into feedback (tenant_id, agent_id, agent_name, company, subject, message, attachments, browser_info, page, crm_version)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       returning id, created_at`,
      [agent.tenant_id, agent.id, agent.name, agent.company_name, subject, message, JSON.stringify(attachments), browserInfo, page, crmVersion]
    );
    const fb = ins.rows[0];

    // Surface in the admin AI Action Queue as a new task type.
    await pool.query(
      `insert into ai_action_queue (action_type, target_table, target_id, proposed_action, reasoning, status)
       values ('feedback','feedback',$1,$2,$3,'pending')`,
      [
        fb.id,
        JSON.stringify({ subject, message, agent_name: agent.name, company: agent.company_name, attachments: attachments.length }),
        `Feedback from ${agent.name} (${agent.company_name}): ${subject}`,
      ]
    );

    return NextResponse.json({ success: true, id: fb.id });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
