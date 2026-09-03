// One-off migration: add confirmed + is_broker_fee to payments.
// Run with: node migrate_payments_confirmed.js
const fs = require("fs");
const path = require("path");

// Load DATABASE_URL from .env.local (Next loads this for the app; we read it manually).
function loadEnv() {
  const f = path.join(__dirname, ".env.local");
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
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
    // Confirmed defaults TRUE so every existing (already-recorded) payment keeps
    // counting toward Collected. Only the NEW auto broker drafts are FALSE.
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_broker_fee BOOLEAN NOT NULL DEFAULT FALSE`);
    const r = await pool.query(`select column_name from information_schema.columns where table_name='payments' and column_name in ('confirmed','is_broker_fee')`);
    console.log("payments columns present:", r.rows.map((x) => x.column_name).join(", ") || "(none)");
    await pool.end();
    console.log("MIGRATION OK");
  } catch (e) {
    console.error("MIGRATION FAILED:", e.message);
    process.exit(1);
  }
})();
