import { NextResponse } from "next/server";
import { getPool } from "../../../../../lib/db";
import { getAuthedEmail, resolveTenant } from "../../../../../lib/portalAuth";
import { parseDelimitedText, parseXlsx, parsePdf, rowToLeadValues } from "../../../../../lib/leadImport";

export const dynamic = "force-dynamic";

const MAX_ROWS = 500;

// POST /api/portal/lead-management/import — bulk-add leads from a pasted
// text template, an uploaded .xlsx, or an uploaded .pdf (its text layer).
// Body: { text } for pasted text, or { filename, file_base64 } for an
// upload. Inserted leads land with assigned_agent_id = null (status
// 'new'), same as any other unassigned lead — a human still assigns them
// from the Unassigned Leads queue; this endpoint never auto-assigns.
export async function POST(request) {
  try {
    const email = await getAuthedEmail(request);
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const pool = getPool();
    const tenant = await resolveTenant(pool, email);
    if (!tenant) return NextResponse.json({ error: "No tenant account" }, { status: 403 });

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { text, filename, file_base64 } = body;
    let parsed;
    try {
      if (file_base64) {
        const bytes = Buffer.from(file_base64, "base64");
        const lower = String(filename || "").toLowerCase();
        if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
          parsed = parseXlsx(bytes);
        } else if (lower.endsWith(".pdf")) {
          parsed = await parsePdf(bytes);
        } else {
          parsed = parseDelimitedText(bytes.toString("utf8"));
        }
      } else if (typeof text === "string" && text.trim()) {
        parsed = parseDelimitedText(text);
      } else {
        return NextResponse.json({ error: "Provide pasted text or a file to import." }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json({ error: "Couldn't read that file: " + (e?.message || "unknown error") }, { status: 400 });
    }

    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
    if (parsed.rows.length === 0) return NextResponse.json({ error: "No rows found to import." }, { status: 400 });

    const rows = parsed.rows.slice(0, MAX_ROWS);
    const truncated = parsed.rows.length > MAX_ROWS;

    const svcRes = await pool.query("select id from services where slug = 'car-shipping' limit 1");
    if (svcRes.rows.length === 0) return NextResponse.json({ error: "car-shipping service not found" }, { status: 500 });
    const serviceId = svcRes.rows[0].id;

    const errors = [];
    const leadIds = [];
    for (let i = 0; i < rows.length; i++) {
      const v = rowToLeadValues(rows[i]);
      if (!v) { errors.push({ row: i + 2, reason: "Missing name or phone" }); continue; }
      try {
        const ins = await pool.query(
          `insert into leads
            (tenant_id, service_id, name, phone, email, origin_zip, origin_city,
             destination_zip, destination_city, vehicle_year, vehicle_make, vehicle_model,
             transport_type, routing_mode, status, lead_source, internal_notes)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'Open','tenant','new','bulk_import',$13)
           returning id`,
          [tenant.id, serviceId, v.name, v.phone, v.email, v.origin_zip, v.origin_city,
           v.destination_zip, v.destination_city, v.vehicle_year, v.vehicle_make, v.vehicle_model, v.notes]
        );
        leadIds.push(ins.rows[0].id);
      } catch (e) {
        errors.push({ row: i + 2, reason: e?.message || "Insert failed" });
      }
    }

    return NextResponse.json({
      inserted: leadIds.length,
      skipped: errors.length,
      errors: errors.slice(0, 50),
      truncated,
      lead_ids: leadIds,
    });
  } catch (e) {
    return NextResponse.json({ error: "Import failed: " + (e?.message || "unknown") }, { status: 500 });
  }
}
