// Phase 4 dispatch helpers: carriers roster, interested board, assignment,
// payments ledger, signature history. All queries use parameterized SQL via
// lib/db's Pool and degrade gracefully (caller decides fallback).
import { getPool } from "./db";

// ---------- carriers ----------
// Rosters are per-tenant: each broker manages (and only sees) their own carriers.
export async function listCarriers(pool, tenantId, { onlyActive = true } = {}) {
  const rows = (
    await pool.query(
      `select id, name, mc_number, contact_name, email, phone, equipment, notes, active
       from carriers where tenant_id = $1 ${onlyActive ? "and active" : ""} order by name`,
      [tenantId]
    )
  ).rows;
  return rows;
}

export async function createCarrier(pool, tenantId, { name, mc_number, contact_name, email, phone, equipment, notes }) {
  const { rows } = await pool.query(
    `insert into carriers (tenant_id, name, mc_number, contact_name, email, phone, equipment, notes)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [tenantId, name, mc_number || null, contact_name || null, email || null, phone || null, equipment || null, notes || null]
  );
  return rows[0].id;
}

// ---------- lead <-> carrier (interested board + assignment) ----------
export async function getLeadCarriers(pool, leadId) {
  const { rows } = await pool.query(
    `select lc.id, lc.lead_id, lc.carrier_id, lc.interested, lc.assigned, lc.notes, lc.created_at,
            c.name, c.mc_number, c.equipment, c.phone, c.email
     from lead_carriers lc join carriers c on c.id = lc.carrier_id
     where lc.lead_id = $1 order by lc.assigned desc, lc.created_at asc`,
    [leadId]
  );
  return rows;
}

// Mark a carrier interested in a lead (dispatch board). Upsert by (lead,carrier).
export async function setInterested(pool, leadId, carrierId, interested, notes) {
  await pool.query(
    `insert into lead_carriers (lead_id, carrier_id, interested, notes)
     values ($1, $2, $3, $4)
     on conflict (lead_id, carrier_id)
     do update set interested = excluded.interested,
                   notes = coalesce(excluded.notes, lead_carriers.notes)`,
    [leadId, carrierId, !!interested, notes || null]
  );
}

// Assign a carrier to the lead. Only one assigned carrier at a time: clear any
// other assigned row for this lead, then set this one. Does NOT overwrite the
// lead.carriers concept — the lead itself keeps no carrier column; this join is
// the source of truth for "who's driving this load".
export async function assignCarrier(pool, leadId, carrierId) {
  await pool.query(`update lead_carriers set assigned = false where lead_id = $1`, [leadId]);
  await pool.query(
    `insert into lead_carriers (lead_id, carrier_id, assigned, interested)
     values ($1, $2, true, true)
     on conflict (lead_id, carrier_id)
     do update set assigned = true, interested = true`,
    [leadId, carrierId]
  );
}

export async function unassignCarrier(pool, leadId) {
  await pool.query(`update lead_carriers set assigned = false where lead_id = $1`, [leadId]);
}

// ---------- payments ----------
export async function getPayments(pool, leadId) {
  const { rows } = await pool.query(
    `select id, lead_id, party, kind, amount, status, method, reference, paid_at, note, created_at
     from payments where lead_id = $1 order by created_at asc`,
    [leadId]
  );
  return rows;
}

export async function addPayment(pool, { leadId, party, kind, amount, status, method, reference, note }) {
  const { rows } = await pool.query(
    `insert into payments (lead_id, party, kind, amount, status, method, reference, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id, paid_at`,
    [leadId, party, kind, Number(amount), status || "pending", method || null, reference || null, note || null]
  );
  return rows[0];
}

export async function setPaymentStatus(pool, paymentId, status, paidAt) {
  await pool.query(
    `update payments set status = $2, paid_at = coalesce($3, case when $2 = 'paid' then now() else null end)
     where id = $1`,
    [paymentId, status, paidAt || null]
  );
}

// ---------- signature history ----------
export async function getSignatureHistory(pool, leadId) {
  const { rows } = await pool.query(
    `select id, lead_id, signer_name, signed_at, ip, kind, contract_snapshot, created_at
     from signature_history where lead_id = $1 order by signed_at asc`,
    [leadId]
  );
  return rows;
}

export async function logSignature(pool, { leadId, signerName, ip, kind, contractSnapshot }) {
  const { rows } = await pool.query(
    `insert into signature_history (lead_id, signer_name, ip, kind, contract_snapshot)
     values ($1, $2, $3, $4, $5) returning id`,
    [leadId, signerName, ip || null, kind || "initial", contractSnapshot ? JSON.stringify(contractSnapshot) : null]
  );
  return rows[0].id;
}
