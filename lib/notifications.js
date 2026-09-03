import { getPool } from "./db";

// Per-agent in-app notifications. Mirrors the project's "propose-then-approve"
// sensibility at the data layer: we just insert rows; the UI surfaces them.
// Degrades silently if the table/pool is unavailable.

export async function createNotification({ agentId, kind, payload = {} }) {
  if (!agentId || !kind) return null;
  try {
    const pool = getPool();
    const { rows } = await pool.query(
      `insert into notifications (agent_id, kind, payload)
       values ($1, $2, $3)
       returning id, kind, read, created_at`,
      [agentId, kind, JSON.stringify(payload)]
    );
    return rows[0];
  } catch {
    return null;
  }
}

export async function listNotifications(pool, agentId, { unreadOnly = false, limit = 25 } = {}) {
  const { rows } = await pool.query(
    `select id, kind, payload, read, created_at
       from notifications
      where agent_id = $1 ${unreadOnly ? "and read = false" : ""}
      order by created_at desc
      limit $2`,
    [agentId, limit]
  );
  return rows;
}

export async function markRead(pool, agentId, id) {
  await pool.query(
    `update notifications set read = true where id = $1 and agent_id = $2`,
    [id, agentId]
  );
}

export async function markAllRead(pool, agentId) {
  await pool.query(
    `update notifications set read = true where agent_id = $1`,
    [agentId]
  );
}
