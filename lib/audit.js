// Phase 1 audit helper: stamp who-did-what and write the activity timeline.
// Mirrors the existing auth pattern in lib/adminAuth.js (resolve the admin
// email from the Supabase session token), so every write can be attributed
// without changing how admin routes authenticate.

import { isAdminRequest } from "./adminAuth";

async function actorEmail(request) {
  if (!request) return null;
  // isAdminRequest is async and returns the admin's email when authorized.
  return await isAdminRequest(request);
}

// Append a timeline entry. Never throws — if the DB/table is unavailable the
// activity line is simply skipped (graceful, per CLAUDE.md conventions). The
// primary write (the tenant/lead change) must NOT depend on this succeeding.
export async function logActivity(pool, { entity_type, entity_id = null, action, summary, details = null, actor = null, request = null }) {
  try {
    const who = actor || (request ? await actorEmail(request) : null);
    await pool.query(
      `insert into activity_log (entity_type, entity_id, action, actor, summary, details)
       values ($1, $2, $3, $4, $5, $6)`,
      [entity_type, entity_id, action, who, summary, details ? JSON.stringify(details) : null]
    );
  } catch {
    // best-effort audit; ignore
  }
}

// Stamp created_by / updated_by on an INSERT/UPDATE. Returns the column set to
// merge into a parameterized query. `mode` = 'create' | 'update'.
export function auditCols(actor, mode = "create") {
  const who = actor || null;
  return mode === "create"
    ? { created_by: who }
    : { updated_by: who };
}

export { actorEmail };
