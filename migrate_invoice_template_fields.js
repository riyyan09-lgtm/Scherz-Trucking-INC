// One-off migration: add invoice_template_fields to tenants.
// Stores the visual field-map (array of {token, page, xPct, yPct, fontSize})
// an admin creates by clicking positions on the tenant's uploaded PDF invoice
// template, so CRM can fill that exact PDF with real order data.
// Run with: node migrate_invoice_template_fields.js
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
    await pool.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_template_fields JSONB`);
    const r = await pool.query(`select column_name from information_schema.columns where table_name='tenants' and column_name='invoice_template_fields'`);
    console.log("tenants columns present:", r.rows.map((x) => x.column_name).join(", ") || "(none)");
    await pool.end();
    console.log("MIGRATION OK");
  } catch (e) {
    console.error("MIGRATION FAILED:", e.message);
    process.exit(1);
  }
})();
