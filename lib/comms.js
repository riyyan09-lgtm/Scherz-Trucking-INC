import { getPool } from "./db";

// Records a comms send event for auditability/tracking.
// Degrades silently if the pool/table is unavailable (convention: never throw
// from a notification helper and never block the caller).
export async function recordComms({
  leadId, channel, to_address, template, status = "sent", error = null, external_id = null,
}) {
  if (!leadId || !channel) return null;
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `insert into comms_log (lead_id, channel, to_address, template, status, error, external_id)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, created_at`,
      [leadId, channel, to_address ?? null, template ?? null, status, error ?? null, external_id ?? null]
    );
    return rows[0];
  } catch {
    return null;
  }
}

// Convenience: log a failed send so Support can see what bounced.
export async function recordCommsFailure(opts) {
  return recordComms({ ...opts, status: "failed" });
}
