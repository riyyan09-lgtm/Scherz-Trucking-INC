import { NextResponse } from "next/server";
import { getPool } from "../../../../../../lib/db";
import { isAdminRequest } from "../../../../../../lib/adminAuth";
import { logActivity } from "../../../../../../lib/audit";
import { INVOICE_TOKENS } from "../../../../../../lib/invoiceTokens";

export const dynamic = "force-dynamic";

const TOKEN_KEYS = new Set(INVOICE_TOKENS.map((t) => t.key));

// PATCH /api/admin/tenants/:id/invoice-template-fields — save the field map
// (positions on a coordinate-overlay PDF, and/or AcroForm field-name
// bindings) for the tenant's ACTIVE template version, built in the admin
// "Map Fields" tool.
export async function PATCH(request, { params }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const fields = Array.isArray(body.fields) ? body.fields : null;
  if (!fields) return NextResponse.json({ error: "Provide fields array" }, { status: 400 });
  for (const f of fields) {
    if (!TOKEN_KEYS.has(f.token)) return NextResponse.json({ error: `Unknown token '${f.token}'` }, { status: 400 });
    if (f.kind === "acroform") {
      if (!f.fieldName) return NextResponse.json({ error: "AcroForm fields need fieldName" }, { status: 400 });
    } else if (typeof f.xPct !== "number" || typeof f.yPct !== "number") {
      return NextResponse.json({ error: "Each coordinate field needs numeric xPct/yPct" }, { status: 400 });
    }
  }
  const clean = fields.map((f) =>
    f.kind === "acroform"
      ? { token: f.token, kind: "acroform", fieldName: f.fieldName }
      : {
          token: f.token,
          kind: "coord",
          page: Number(f.page) || 0,
          xPct: Math.max(0, Math.min(1, f.xPct)),
          yPct: Math.max(0, Math.min(1, f.yPct)),
          ...(typeof f.wPct === "number" ? { wPct: Math.max(0, Math.min(1, f.wPct)) } : {}),
          ...(typeof f.hPct === "number" ? { hPct: Math.max(0, Math.min(1, f.hPct)) } : {}),
          fontSize: Number(f.fontSize) || 10,
          ...(typeof f.color === "string" && /^#[0-9a-f]{6}$/i.test(f.color) ? { color: f.color } : {}),
          ...(Number(f.repeatRows) > 1 ? { repeatRows: Math.min(20, Number(f.repeatRows)), rowStepPct: Math.max(0, Number(f.rowStepPct) || 0) } : {}),
        }
  );
  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const tenantRes = await pool.query(
      `select id, company_name, active_invoice_template_version_id from tenants where id = $1 and deleted_at is null`,
      [id]
    );
    if (tenantRes.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const versionId = tenantRes.rows[0].active_invoice_template_version_id;
    if (!versionId) {
      return NextResponse.json({ error: "Upload a PDF template before mapping fields" }, { status: 400 });
    }
    await pool.query(`update invoice_template_versions set field_map = $1 where id = $2`, [JSON.stringify(clean), versionId]);
    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: id,
      action: "invoice_template_fields_updated",
      summary: `Mapped ${clean.length} invoice field${clean.length === 1 ? "" : "s"} for tenant "${tenantRes.rows[0].company_name}".`,
      actor: who,
      request,
    });
    return NextResponse.json({ success: true, fields: clean });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
