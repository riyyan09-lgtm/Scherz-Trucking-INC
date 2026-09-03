// One-off migration: invoice template versioning + generated invoice history.
//
// invoice_template_versions — each admin PDF upload creates a new row here
// instead of overwriting in place, so replacing a template never changes
// what a previously generated invoice looked like.
//
// tenants.active_invoice_template_version_id — which version is "live" for
// new invoice generation.
//
// invoices — the actual filled/flattened PDFs (or rendered text invoices)
// generated per order, saved to the customer's record for later download,
// each tied to the exact template version used.
//
// Run with: node migrate_invoice_template_versions.js
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const f = path.join(__dirname, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.replace(/\r$/, "").match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
loadEnv();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoice_template_versions (
        id SERIAL PRIMARY KEY,
        tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        version INT NOT NULL,
        name TEXT,
        file TEXT NOT NULL,
        type TEXT NOT NULL,
        parsed_json JSONB,
        is_acroform BOOLEAN NOT NULL DEFAULT FALSE,
        acroform_fields JSONB,
        field_map JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_itv_tenant ON invoice_template_versions(tenant_id)`);

    await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS active_invoice_template_version_id INT REFERENCES invoice_template_versions(id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        lead_id INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        template_version_id INT REFERENCES invoice_template_versions(id),
        kind TEXT NOT NULL DEFAULT 'pdf_template',
        file TEXT,
        text_body TEXT,
        generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        generated_by INT REFERENCES agents(id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invoices_lead ON invoices(lead_id)`);

    const cols = await pool.query(`
      select table_name, column_name from information_schema.columns
      where (table_name = 'invoice_template_versions' and column_name in ('id','tenant_id','field_map','acroform_fields'))
         or (table_name = 'tenants' and column_name = 'active_invoice_template_version_id')
         or (table_name = 'invoices' and column_name in ('id','lead_id','template_version_id'))
      order by table_name, column_name
    `);
    console.log("columns present:", cols.rows.map((r) => `${r.table_name}.${r.column_name}`).join(", "));
    await pool.end();
    console.log("MIGRATION OK");
  } catch (e) {
    console.error("MIGRATION FAILED:", e.message);
    process.exit(1);
  }
})();
