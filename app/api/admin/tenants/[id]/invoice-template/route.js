import { NextResponse } from "next/server";
import { getPool } from "../../../../../../lib/db";
import { isAdminRequest } from "../../../../../../lib/adminAuth";
import { logActivity } from "../../../../../../lib/audit";
import { detectAcroFormFields } from "../../../../../../lib/pdfInvoice";

export const dynamic = "force-dynamic";

const ALLOWED = ["pdf", "png", "jpg", "jpeg", "webp"];
const MAX_BYTES = 15 * 1024 * 1024; // 15MB

// Best-effort "parse" of an uploaded invoice template for non-PDF (image)
// templates — those can't be field-mapped (no page to draw text onto), so
// they stay reference-only. PDFs get real AcroForm detection instead, see
// detectAcroFormFields().
function parseTemplate(type, buf, filename) {
  const parsed = {
    type,
    filename,
    size_bytes: buf.length,
    parsed_at: new Date().toISOString(),
    dimensions: null,
  };
  if (type === "png" && buf.length >= 24) {
    parsed.dimensions = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } else if ((type === "jpg" || type === "jpeg") && buf.length >= 4) {
    parsed.dimensions = readJpegSize(buf);
  }
  return parsed;
}

function readJpegSize(buf) {
  let off = 2;
  while (off < buf.length - 9) {
    if (buf[off] !== 0xff) break;
    const marker = buf[off + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { width: buf.readUInt16BE(off + 7), height: buf.readUInt16BE(off + 5) };
    }
    const len = buf.readUInt16BE(off + 2);
    off += len + 2;
  }
  return null;
}

// GET /api/admin/tenants/:id/invoice-template — active template version
// (incl. file + field map) plus the version history list.
export async function GET(request, { params }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });
  try {
    const pool = getPool();
    const tenantRes = await pool.query(
      `select active_invoice_template_version_id from tenants where id = $1 and deleted_at is null`,
      [id]
    );
    if (tenantRes.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    const activeId = tenantRes.rows[0].active_invoice_template_version_id;

    const versionsRes = await pool.query(
      `select id, version, name, type, template_kind, created_at, created_by from invoice_template_versions
         where tenant_id = $1 order by version desc`,
      [id]
    );

    if (!activeId) {
      return NextResponse.json({ has_template: false, versions: versionsRes.rows });
    }
    const active = versionsRes.rows.find((v) => v.id === activeId);
    const fileRes = await pool.query(
      `select file, parsed_json, is_acroform, acroform_fields, field_map, template_kind, html_body, logo_data
       from invoice_template_versions where id = $1`,
      [activeId]
    );
    const v = fileRes.rows[0];
    return NextResponse.json({
      has_template: true,
      version_id: activeId,
      version: active?.version,
      name: active?.name,
      type: active?.type,
      template_kind: v?.template_kind || "pdf_coord",
      parsed: v?.parsed_json,
      is_acroform: v?.is_acroform || false,
      acroform_fields: v?.acroform_fields || [],
      fields: v?.field_map || [],
      updated_at: active?.created_at,
      updated_by: active?.created_by,
      file: v?.file,
      html_body: v?.html_body,
      logo_data: v?.logo_data,
      versions: versionsRes.rows,
    });
  } catch (e) {
    return NextResponse.json({ error: "Database unavailable: " + (e?.message || "") }, { status: 503 });
  }
}

// PATCH /api/admin/tenants/:id/invoice-template — upload a new template
// VERSION (never overwrites a prior version — invoices already generated
// from an older version keep rendering the same way). Becomes the active
// version for new invoice generation.
// Body (PDF/image): { file: base64 data URL, name, type }
// Body (HTML): { template_kind: "html", html_body, logo_data?, name }
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

  if (body.template_kind === "html") {
    if (!body.html_body || typeof body.html_body !== "string" || !body.html_body.trim()) {
      return NextResponse.json({ error: "Provide html_body" }, { status: 400 });
    }
    if (body.html_body.length > 200_000) {
      return NextResponse.json({ error: "HTML template too large (max 200KB)" }, { status: 413 });
    }
    if (body.logo_data && (typeof body.logo_data !== "string" || !body.logo_data.startsWith("data:image/"))) {
      return NextResponse.json({ error: "logo_data must be an image data URL" }, { status: 400 });
    }
    try {
      const pool = getPool();
      const who = await isAdminRequest(request);
      const existing = await pool.query(`select id, company_name from tenants where id = $1 and deleted_at is null`, [id]);
      if (existing.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

      const verRes = await pool.query(
        `select coalesce(max(version), 0) + 1 as next from invoice_template_versions where tenant_id = $1`,
        [id]
      );
      const nextVersion = verRes.rows[0].next;

      const inserted = await pool.query(
        `insert into invoice_template_versions (tenant_id, version, name, template_kind, html_body, logo_data, field_map, created_by)
         values ($1, $2, $3, 'html', $4, $5, '[]'::jsonb, $6)
         returning id, version, created_at`,
        [id, nextVersion, body.name || "HTML Invoice", body.html_body, body.logo_data || null, who || null]
      );
      const versionRow = inserted.rows[0];

      await pool.query(`update tenants set active_invoice_template_version_id = $1, updated_at = now(), updated_by = $2 where id = $3`, [
        versionRow.id, who || null, id,
      ]);

      await logActivity(pool, {
        entity_type: "tenant",
        entity_id: id,
        action: "invoice_template_updated",
        summary: `Saved HTML invoice template "${body.name || "HTML Invoice"}" (v${nextVersion}) for tenant "${existing.rows[0].company_name}".`,
        actor: who,
        request,
      });
      return NextResponse.json({ success: true, version_id: versionRow.id, version: versionRow.version, template_kind: "html" });
    } catch (e) {
      return NextResponse.json({ error: "Database unavailable: " + (e?.message || "") }, { status: 503 });
    }
  }

  if (!body.file || typeof body.file !== "string" || !body.file.startsWith("data:")) {
    return NextResponse.json({ error: "Missing or invalid file data URL" }, { status: 400 });
  }
  const type = String(body.type || "").toLowerCase();
  if (!ALLOWED.includes(type)) {
    return NextResponse.json({ error: `Unsupported type '${type}'. Allowed: ${ALLOWED.join(", ")}` }, { status: 400 });
  }
  const comma = body.file.indexOf(",");
  const b64 = comma >= 0 ? body.file.slice(comma + 1) : body.file;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 15MB)" }, { status: 413 });
  }
  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const existing = await pool.query(`select id, company_name from tenants where id = $1 and deleted_at is null`, [id]);
    if (existing.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    let acroFields = [];
    if (type === "pdf") {
      acroFields = await detectAcroFormFields(bytes);
    }
    const parsed = parseTemplate(type, bytes, body.name || "invoice-template");

    const verRes = await pool.query(
      `select coalesce(max(version), 0) + 1 as next from invoice_template_versions where tenant_id = $1`,
      [id]
    );
    const nextVersion = verRes.rows[0].next;

    const inserted = await pool.query(
      `insert into invoice_template_versions (tenant_id, version, name, file, type, parsed_json, is_acroform, acroform_fields, field_map, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, '[]'::jsonb, $9)
       returning id, version, created_at`,
      [id, nextVersion, body.name || "invoice-template", body.file, type, JSON.stringify(parsed), acroFields.length > 0, JSON.stringify(acroFields), who || null]
    );
    const versionRow = inserted.rows[0];

    await pool.query(`update tenants set active_invoice_template_version_id = $1, updated_at = now(), updated_by = $2 where id = $3`, [
      versionRow.id, who || null, id,
    ]);

    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: id,
      action: "invoice_template_updated",
      summary: `Uploaded invoice template "${body.name || "invoice-template"}" (${type}, v${nextVersion}${acroFields.length ? `, ${acroFields.length} form fields detected` : ""}) for tenant "${existing.rows[0].company_name}".`,
      actor: who,
      request,
    });
    return NextResponse.json({
      success: true,
      version_id: versionRow.id,
      version: versionRow.version,
      type,
      name: body.name,
      parsed,
      is_acroform: acroFields.length > 0,
      acroform_fields: acroFields,
    });
  } catch (e) {
    return NextResponse.json({ error: "Database unavailable: " + (e?.message || "") }, { status: 503 });
  }
}

// DELETE /api/admin/tenants/:id/invoice-template — deactivate the current
// template (generation falls back to the default text template). Past
// versions are kept — only the "active" pointer is cleared — so previously
// generated invoices are unaffected and the template can be reactivated.
export async function DELETE(request, { params }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: "Bad tenant id" }, { status: 400 });
  try {
    const pool = getPool();
    const who = await isAdminRequest(request);
    const existing = await pool.query(`select id, company_name from tenants where id = $1 and deleted_at is null`, [id]);
    if (existing.rows.length === 0) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    await pool.query(
      `update tenants set active_invoice_template_version_id = null, updated_at = now(), updated_by = $1 where id = $2`,
      [who || null, id]
    );
    await logActivity(pool, {
      entity_type: "tenant",
      entity_id: id,
      action: "invoice_template_deleted",
      summary: `Deactivated invoice template for tenant "${existing.rows[0].company_name}". Falls back to default text template.`,
      actor: who,
      request,
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: "Database unavailable: " + (e?.message || "") }, { status: 503 });
  }
}
