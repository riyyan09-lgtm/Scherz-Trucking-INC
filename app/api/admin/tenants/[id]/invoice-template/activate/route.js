import { NextResponse } from "next/server";
import { getPool } from "../../../../../../../lib/db";
import { isAdminRequest } from "../../../../../../../lib/adminAuth";
import { logActivity } from "../../../../../../../lib/audit";

export const dynamic = "force-dynamic";

// POST /api/admin/tenants/:id/invoice-template/activate — switch the active
// template version without uploading a new file (e.g. roll back to a prior
// version). Body: { version_id }
export async function POST(request, { params }) {
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
  const versionId = Number(body?.version_id);
  if (!versionId) return NextResponse.json({ error: "Provide version_id" }, { status: 400 });
  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const existing = await pool.query(`select id, company_name from tenants where id = $1 and deleted_at is null`, [id]);
    if (existing.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const ver = await pool.query(`select id, version from invoice_template_versions where id = $1 and tenant_id = $2`, [versionId, id]);
    if (ver.rows.length === 0) return NextResponse.json({ error: "Template version not found" }, { status: 404 });

    await pool.query(`update tenants set active_invoice_template_version_id = $1, updated_at = now(), updated_by = $2 where id = $3`, [
      versionId, who || null, id,
    ]);
    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: id,
      action: "invoice_template_activated",
      summary: `Activated invoice template v${ver.rows[0].version} for tenant "${existing.rows[0].company_name}".`,
      actor: who,
      request,
    });
    return NextResponse.json({ success: true, version_id: versionId, version: ver.rows[0].version });
  } catch (e) {
    return NextResponse.json({ error: "Database unavailable: " + (e?.message || "") }, { status: 503 });
  }
}
