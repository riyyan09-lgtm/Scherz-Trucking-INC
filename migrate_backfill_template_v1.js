// One-off: backfill existing tenants.invoice_template_file/fields into
// invoice_template_versions as version 1, so the new versioned system has
// continuity with whatever admins already uploaded/mapped.
// Run with: node migrate_backfill_template_v1.js
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const f = path.join(__dirname, ".env.local");
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.replace(/\r$/, "").match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const tenants = await pool.query(
    `select id, invoice_template_file, invoice_template_name, invoice_template_type,
            invoice_template_parsed_json, invoice_template_fields, active_invoice_template_version_id
       from tenants where invoice_template_file is not null`
  );
  for (const t of tenants.rows) {
    if (t.active_invoice_template_version_id) {
      console.log(`tenant ${t.id}: already has an active version, skipping`);
      continue;
    }
    const fieldMap = (t.invoice_template_fields || []).map((f) => ({ ...f, kind: "coord" }));
    const { rows } = await pool.query(
      `insert into invoice_template_versions (tenant_id, version, name, file, type, parsed_json, is_acroform, acroform_fields, field_map, created_by)
       values ($1, 1, $2, $3, $4, $5, false, null, $6, 'backfill')
       returning id`,
      [t.id, t.invoice_template_name, t.invoice_template_file, t.invoice_template_type, t.invoice_template_parsed_json, JSON.stringify(fieldMap)]
    );
    await pool.query(`update tenants set active_invoice_template_version_id = $1 where id = $2`, [rows[0].id, t.id]);
    console.log(`tenant ${t.id}: created version ${rows[0].id} with ${fieldMap.length} fields`);
  }
  await pool.end();
  console.log("BACKFILL OK");
})().catch((e) => { console.error("BACKFILL FAILED:", e.message); process.exit(1); });
