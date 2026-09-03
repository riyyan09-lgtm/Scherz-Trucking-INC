import { Pool } from "pg";

// Reuses a single connection pool across requests instead of opening a new
// connection per request -- important once this is handling real traffic.
let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your database connection string."
      );
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Most managed Postgres providers (Supabase, Neon, RDS) require SSL even
      // for local development; only skip it for a database on this machine.
      ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL)
        ? false
        : { rejectUnauthorized: false },
      // Serverless (Vercel) opens many short-lived function instances; keep the
      // pool small and recycle connections before Supabase terminates idle ones
      // (~5 min), or you get intermittent "Database unavailable" from dead sockets.
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 8000,
      keepAlive: true,
      application_name: "shipgrid_app",
    });
  }
  return pool;
}

// Run `fn` inside a real transaction.
//
// IMPORTANT: never do `pool.query("begin") ... pool.query("commit")`. Each
// pool.query() may check out a DIFFERENT connection, so BEGIN lands on one
// connection while the writes run (auto-committed) on others, and COMMIT on
// yet another. The result is no atomicity, no working rollback, and a
// connection left stuck in an open transaction — which surfaces later as an
// intermittent "Database unavailable". A transaction must hold one client.
//
// Usage:  await withTransaction(async (tx) => { await tx.query(...); });
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try { await client.query("rollback"); } catch { /* connection already dead */ }
    throw err;
  } finally {
    client.release();
  }
}
