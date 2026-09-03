import { NextResponse } from "next/server";
import crypto from "crypto";
import { getPool } from "../../../../lib/db";
import { resolveAgent } from "../../../../lib/crmAuth";
import { sendQuoteEmail } from "../../../../lib/crmEmails";
import { logActivity } from "../../../../lib/audit";

export const dynamic = "force-dynamic";

const AGENT_STATUSES = ["assigned", "contacted", "quoted", "booked", "closed", "dead"];

// Whitelisted editable columns and how to coerce them.
const TEXT_FIELDS = [
  "name", "phone", "email",
  "origin_city", "origin_state", "origin_zip", "origin_address",
  "destination_city", "destination_state", "destination_zip", "destination_address",
  "transport_type", "special_terms", "reference_id", "secondary_status",
  "carrier_pay_terms", "broker_fee_terms", "internal_memo",
  // spec redesign new fields
  "priority", "internal_status", "customer_company", "insurance", "payment_method",
  "lead_source", "pickup_contact", "delivery_contact", "pickup_notes", "delivery_notes",
  "residential_pickup", "residential_delivery", "liftgate", "auction", "cod_amount", "customer_since", "mileage",
  // simplified-layout modal fields
  "pickup_gate", "delivery_gate", "pickup_phone", "delivery_phone", "pickup_email", "delivery_email",
  "pickup_company", "delivery_company", "pickup_hours", "delivery_hours",
  "origin_address2", "destination_address2", "internal_notes",
];
const NUM_FIELDS = ["total_tariff", "carrier_pay", "lifetime_value", "distance_miles", "est_transit_days", "deposit", "cod_amount"];
const DATE_FIELDS = ["follow_up_date", "quote_expiration", "desired_delivery_date", "pickup_date", "last_contacted", "customer_since"];
const BOOL_FIELDS = ["require_edoc", "residential_pickup", "residential_delivery", "liftgate", "auction"];
const JSON_FIELDS = ["customer_tags"];
const INT_FIELDS = ["total_quotes", "total_bookings", "booking_clicks"];

export async function GET(request) {
  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });
    const { rows } = await pool.query(
      `select l.* from leads l where l.assigned_agent_id = $1 order by l.created_at desc`,
      [agent.id]
    );
    // This calendar month's refunds + chargebacks for the agent's leads —
    // drives the "Refunds This Month / Chargebacks This Month" dashboard KPIs.
    const monthAgg = await pool.query(
      `select
         coalesce(sum(p.amount) filter (where p.refunded = true and (p.refund_type is distinct from 'chargeback')),0) as refunded,
         coalesce(sum(p.amount) filter (where p.refunded = true and p.refund_type = 'chargeback'),0) as chargebacks,
         count(*) filter (where p.refunded = true and (p.refund_type is distinct from 'chargeback')) as refunded_count,
         count(*) filter (where p.refunded = true and p.refund_type = 'chargeback') as chargebacks_count,
         coalesce(sum(p.amount) filter (where p.refunded = true and p.refund_type = 'chargeback' and p.chargeback_status = 'Won'),0) as won,
         count(*) filter (where p.refunded = true and p.refund_type = 'chargeback' and p.chargeback_status = 'Won') as won_count,
         coalesce(sum(p.amount) filter (where p.refunded = true and p.refund_type = 'chargeback' and p.chargeback_status = 'Lost'),0) as lost,
         count(*) filter (where p.refunded = true and p.refund_type = 'chargeback' and p.chargeback_status = 'Lost') as lost_count
       from payments p
       join leads l on l.id = p.lead_id
       where l.assigned_agent_id = $1
         and p.refunded = true
         and date_trunc('month', coalesce(p.refund_date, p.payment_date)::date) = date_trunc('month', current_date)`,
      [agent.id]
    );
    const refundsMonth = monthAgg.rows[0] || { refunded: 0, chargebacks: 0, refunded_count: 0, chargebacks_count: 0 };
    return NextResponse.json({
      agent: { id: agent.id, name: agent.name, phone: agent.phone, tenant_id: agent.tenant_id, company: agent.company_name },
      leads: rows,
      refunds_month: {
        refunded: Number(refundsMonth.refunded || 0),
        chargebacks: Number(refundsMonth.chargebacks || 0),
        refunded_count: Number(refundsMonth.refunded_count || 0),
        chargebacks_count: Number(refundsMonth.chargebacks_count || 0),
        won: Number(refundsMonth.won || 0),
        won_count: Number(refundsMonth.won_count || 0),
        lost: Number(refundsMonth.lost || 0),
        lost_count: Number(refundsMonth.lost_count || 0),
      },
      statuses: AGENT_STATUSES,
      site: `${process.env.NEXT_PUBLIC_SITE_URL || "https://scherztruckinginc.com"}`,
    });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}

export async function PATCH(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "Provide a lead id" }, { status: 400 });
  if (body.status !== undefined && !AGENT_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    const pool = getPool();
    const { agent, status, error } = await resolveAgent(pool, request);
    if (error) return NextResponse.json({ error }, { status });

    const cur = await pool.query(
      `select l.*, t.company_name from leads l join tenants t on l.tenant_id = t.id
       where l.id = $1 and l.assigned_agent_id = $2`,
      [id, agent.id]
    );
    if (cur.rows.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const lead = cur.rows[0];

    // Build a dynamic, whitelisted UPDATE from the provided fields.
    // setsMap dedupes by column so a field set twice (e.g. secondary_status
    // on booked) doesn't produce "multiple assignments to same column".
    const setsMap = new Map();
    const put = (col, val) => { setsMap.set(col, val); };
    for (const f of TEXT_FIELDS) if (body[f] !== undefined) put(f, body[f] === "" ? null : String(body[f]));
    for (const f of NUM_FIELDS) if (body[f] !== undefined) put(f, body[f] === "" || body[f] == null ? null : Number(body[f]));
    for (const f of INT_FIELDS) if (body[f] !== undefined) put(f, body[f] === "" || body[f] == null ? 0 : Number(body[f]));
    for (const f of DATE_FIELDS) if (body[f] !== undefined) put(f, body[f] ? String(body[f]) : null);
    for (const f of BOOL_FIELDS) if (body[f] !== undefined) put(f, body[f] === true || body[f] === "true" || body[f] === 1);
    for (const f of JSON_FIELDS) if (body[f] !== undefined) put(f, JSON.stringify(body[f]));

    const newTariff = body.total_tariff !== undefined && body.total_tariff !== ""
      ? Number(body.total_tariff) : lead.total_tariff;

    // Booking link: generate a token on demand.
    if (body.generate_booking_token && !lead.booking_token) {
      put("booking_token", crypto.randomBytes(9).toString("base64url"));
    }
    // Rotate the booking token: always mint a NEW token. Used when issuing a
    // change order so the customer gets a fresh link to re-sign while the
    // previously-signed link (and its certificate) stays intact for the
    // original contract.
    if (body.rotate_booking_token) {
      put("booking_token", crypto.randomBytes(9).toString("base64url"));
      put("contract_dirty", true);
    }

    // Change order: if the contract is already signed and any detail the
    // customer agreed to (addresses, price, phone, route) is being changed,
    // flag it so it must be re-signed as a change order.
    const CONTRACT_FIELDS = [
      "total_tariff", "phone", "origin_address", "destination_address",
      "origin_city", "origin_state", "origin_zip",
      "destination_city", "destination_state", "destination_zip",
    ];
    if (lead.signed_at && !lead.contract_dirty) {
      const changed = CONTRACT_FIELDS.some((f) => {
        if (body[f] === undefined) return false;
        const a = body[f] === "" ? null : String(body[f]);
        const b = lead[f] == null ? null : String(lead[f]);
        return a !== b;
      });
      if (changed) put("contract_dirty", true);
    }

    if (body.status !== undefined) {
      if (body.status === "quoted" && !(newTariff > 0)) {
        return NextResponse.json({ error: "Set a total tariff before marking the lead quoted" }, { status: 400 });
      }
      put("status", body.status);
      const becomesBooked = body.status === "booked" && lead.status !== "booked";
      if (becomesBooked) {
        put("closed_at", "now()__RAW");
        if (lead.sale_amount == null) put("sale_amount", newTariff ?? null);
        // Orders track carrier progress, not the quote's sales status. Reset to
        // the first order stage on conversion (unless the caller set an order
        // status in this same request), so a leftover "Hot"/"Warm" doesn't
        // carry over into the Orders list.
        const ORDER_STAGES = ["Searching For Carriers", "Carrier Assigned", "Dispatched", "Picked Up", "In Transit", "Delivered"];
        if (body.secondary_status === undefined || !ORDER_STAGES.includes(body.secondary_status)) {
          put("secondary_status", "Searching For Carriers");
        }
        if (!lead.order_number) put("order_number", "ORD-" + Date.now().toString().slice(-8));
        if (!lead.converted_at) put("converted_at", "now()__RAW");
      } else if (["assigned", "contacted", "quoted", "dead"].includes(body.status)) {
        put("closed_at", null);
      } else if (body.status === "closed" && lead.closed_at == null) {
        put("closed_at", "now()__RAW");
      }
    }

    const becomesQuoted = body.status === "quoted" && lead.status !== "quoted";
    if (becomesQuoted) put("quoted_at", "now()__RAW");

    // Auto-generate a booking link the moment a lead becomes a quote or an
    // order, so agents never manually create one. (Manual creation via
    // generate_booking_token above still works when a token is missing.)
    if ((body.status === "quoted" || body.status === "booked") && !lead.booking_token) {
      put("booking_token", crypto.randomBytes(9).toString("base64url"));
    }

    if (setsMap.size === 0) {
      const bt = await pool.query(`select booking_token from leads where id = $1`, [id]);
      return NextResponse.json({ success: true, booking_token: bt.rows[0]?.booking_token ?? null });
    }
    put("updated_by", agent.email); // Phase 1 audit stamp

    // Rebuild the SET clause from the deduped map, emitting now() inline
    // (can't be a bind param) and renumbering the remaining placeholders.
    const finalSets = [];
    const finalVals = [];
    for (const [col, val] of setsMap) {
      if (val === "now()__RAW") {
        finalSets.push(`${col} = now()`);
      } else {
        finalVals.push(val);
        finalSets.push(`${col} = $${finalVals.length}`);
      }
    }
    finalVals.push(id);
    await pool.query(`update leads set ${finalSets.join(", ")} where id = $${finalVals.length}`, finalVals);

    // Phase 3/spec change log: one row per changed field (append-only audit).
    try {
      const changed = [];
      const allFields = [...TEXT_FIELDS, ...NUM_FIELDS, ...INT_FIELDS, ...DATE_FIELDS, ...BOOL_FIELDS, ...JSON_FIELDS];
      for (const f of allFields) {
        if (body[f] === undefined) continue;
        const a = body[f] === "" || body[f] == null ? null : String(body[f]);
        const b = lead[f] == null ? null : String(lead[f]);
        if (a !== b) changed.push([f, b, a]);
      }
      for (const [f, oldV, newV] of changed) {
        await pool.query(
          `insert into change_log (lead_id, agent_id, actor, field, old_value, new_value) values ($1,$2,$3,$4,$5,$6)`,
          [id, agent.id, agent.email, f, oldV, newV]
        );
      }
    } catch { /* change log is best-effort */ }

    // Phase 3: record a pricing-history row when the tariff or carrier pay changed.
    try {
      const tNew = body.total_tariff !== undefined ? (body.total_tariff === "" || body.total_tariff == null ? null : Number(body.total_tariff)) : lead.total_tariff;
      const cNew = body.carrier_pay !== undefined ? (body.carrier_pay === "" || body.carrier_pay == null ? null : Number(body.carrier_pay)) : lead.carrier_pay;
      const tOld = lead.total_tariff == null ? null : Number(lead.total_tariff);
      const cOld = lead.carrier_pay == null ? null : Number(lead.carrier_pay);
      const bfOld = (tOld == null || cOld == null) ? null : Math.round((tOld - cOld) * 100) / 100;
      const bfNew = (tNew == null || cNew == null) ? null : Math.round((tNew - cNew) * 100) / 100;
      if (String(tNew) !== String(tOld) || String(cNew) !== String(cOld)) {
        await pool.query(
          `insert into pricing_history (lead_id, agent_id, old_total_tariff, total_tariff, old_carrier_pay, carrier_pay, old_broker_fee, new_broker_fee, reason, actor)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [id, agent.id, tOld, tNew, cOld, cNew, bfOld, bfNew, "edited in CRM", agent.email]
        );
      }
    } catch { /* pricing history is best-effort */ }

    // Phase 1 activity log: one entry per save, highlighting the changes that
    // matter (status, price, contract-affecting edits). Best-effort.
    const highlights = [];
    if (body.status !== undefined && body.status !== lead.status) highlights.push(`status ${lead.status}→${body.status}`);
    if (body.total_tariff !== undefined && String(body.total_tariff) !== String(lead.total_tariff ?? "")) highlights.push(`tariff→$${body.total_tariff}`);
    if (body.carrier_pay !== undefined && String(body.carrier_pay) !== String(lead.carrier_pay ?? "")) highlights.push(`carrier pay→$${body.carrier_pay}`);
    await logActivity(pool, {
      entity_type: "lead",
      entity_id: id,
      action: body.status !== undefined && body.status !== lead.status ? "status_changed" : "updated",
      summary: `Lead #${id} updated${highlights.length ? `: ${highlights.join(", ")}` : ""}.`,
      actor: agent.email,
    });

    // Spec #10 / #15: record sales activity + booking events (best-effort).
    try {
      if (becomesQuoted && lead.email) {
        await pool.query(`insert into sales_activity (lead_id, agent_id, tenant_id, kind, detail) values ($1,$2,$3,$4,$5)`,
          [id, agent.id, agent.tenant_id, "email_sent", "quote emailed"]);
      }
      if (body.generate_booking_token && !lead.booking_token) {
        await pool.query(`insert into sales_activity (lead_id, agent_id, tenant_id, kind, detail) values ($1,$2,$3,$4,$5)`,
          [id, agent.id, agent.tenant_id, "booking_link_sent", "booking link generated"]);
        await pool.query(`insert into booking_events (lead_id, agent_id, state, detail) values ($1,$2,$3,$4)`,
          [id, agent.id, "link_sent", "link generated"]);
        await pool.query(`update leads set last_contacted = now() where id = $1`, [id]);
      }
      if (body.status === "contacted" && lead.status !== "contacted") {
        await pool.query(`update leads set last_contacted = now() where id = $1`, [id]);
      }
    } catch { /* activity is best-effort */ }

    let quoteEmail = null;
    if (becomesQuoted) {
      quoteEmail = lead.email
        ? (await sendQuoteEmail({ lead, companyName: lead.company_name, agentName: agent.name, agentEmail: agent.email, tariff: newTariff }))
          ? "sent" : "failed"
        : "no_customer_email";
    }

    const updated = await pool.query(`select booking_token from leads where id = $1`, [id]);
    return NextResponse.json({ success: true, quote_email: quoteEmail, booking_token: updated.rows[0].booking_token });
  } catch (e) {
    return NextResponse.json({ error: "Database error: " + (e?.message || "unknown") }, { status: 503 });
  }
}
