import { getPool } from "./db";

// Returns the tenant's custom invoice template, or null to signal that the
// caller should fall back to the default Scherz Trucking INC invoice template.
//   { file, type, parsed } | null
// `file` is a base64 data URL suitable for rendering / embedding in a PDF.
export async function getInvoiceTemplate(tenantId) {
  const pool = getPool();
  const r = await pool.query(
    `select invoice_template_file as file, invoice_template_type as type, invoice_template_parsed_json as parsed
       from tenants where id = $1 and deleted_at is null`,
    [tenantId]
  );
  const t = r.rows[0];
  if (!t || !t.file) return null;
  return { file: t.file, type: t.type, parsed: t.parsed };
}
