import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { logSignature } from "../../../../lib/dispatch";

export const dynamic = "force-dynamic";

// Public booking endpoint — the token IS the authorization, so we expose only
// the minimum a customer needs to confirm and sign. No agent/tenant data.
function publicView(l, vehicles) {
  return {
    name: l.name,
    company: l.company_name,
    // Vehicles live in lead_vehicles (the CRM writes there). Fall back to the
    // legacy leads.vehicles JSON, then to the scalar vehicle_year/make/model.
    vehicles:
      Array.isArray(vehicles) && vehicles.length
        ? vehicles
        : Array.isArray(l.vehicles) && l.vehicles.length
        ? l.vehicles
        : [{ year: l.vehicle_year, make: l.vehicle_make, model: l.vehicle_model }].filter(
            (v) => v.year || v.make || v.model
          ),
    origin: [l.origin_city, l.origin_state].filter(Boolean).join(", "),
    destination: [l.destination_city, l.destination_state].filter(Boolean).join(", "),
    origin_zip: l.origin_zip,
    destination_zip: l.destination_zip,
    pickup_date: l.pickup_date,
    total_tariff: l.total_tariff,
    broker_fee: l.carrier_pay != null && l.total_tariff != null
      ? Math.max(0, Number(l.total_tariff) - Number(l.carrier_pay))
      : null,
    transport_type: l.transport_type,
    origin_address: l.origin_address,
    destination_address: l.destination_address,
    pickup_contact: l.pickup_contact,
    pickup_phone: l.pickup_phone,
    delivery_contact: l.delivery_contact,
    delivery_phone: l.delivery_phone,
    signed_at: l.signed_at,
    signed_name: l.signed_name,
    change_order: Boolean(l.signed_at && l.contract_dirty),
  };
}

async function fetchByToken(pool, token) {
  const { rows } = await pool.query(
    `select l.*, t.company_name from leads l
     join tenants t on l.tenant_id = t.id
     where l.booking_token = $1 limit 1`,
    [token]
  );
  const lead = rows[0] || null;
  if (!lead) return null;
  // Pull vehicles from lead_vehicles (the CRM writes here).
  const { rows: vrows } = await pool.query(
    `select year, make, model, type, vin, running, color, plate, damage_notes as notes, lot_number, keys_available, weight
       from lead_vehicles where lead_id = $1 order by sort_order, id`,
    [lead.id]
  );
  lead._vehicles = vrows.map((v) => ({
    year: v.year,
    make: v.make,
    model: v.model,
    type: v.type,
    vin: v.vin,
    running: v.running,
    color: v.color,
    plate: v.plate,
    notes: v.notes,
    lot_number: v.lot_number,
    keys_available: v.keys_available,
    weight: v.weight,
  }));
  return lead;
}

export async function GET(request, { params }) {
  try {
    const pool = getPool();
    const lead = await fetchByToken(pool, params.token);
    if (!lead) return NextResponse.json({ error: "This booking link is invalid or expired." }, { status: 404 });
    return NextResponse.json({ booking: publicView(lead, lead._vehicles) });
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}

// POST — customer submits full addresses and signs the transport agreement.
export async function POST(request, { params }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid submission" }, { status: 400 });
  }
  const originAddress = String(body?.origin_address || "").trim();
  const destAddress = String(body?.destination_address || "").trim();
  const signedName = String(body?.signed_name || "").trim();
  const pickupContact = String(body?.pickup_contact || "").trim().slice(0, 120) || null;
  const pickupPhone = String(body?.pickup_phone || "").trim().slice(0, 40) || null;
  const deliveryContact = String(body?.delivery_contact || "").trim().slice(0, 120) || null;
  const deliveryPhone = String(body?.delivery_phone || "").trim().slice(0, 40) || null;
  if (originAddress.length < 6 || destAddress.length < 6) {
    return NextResponse.json({ error: "Enter complete pickup and drop-off addresses." }, { status: 400 });
  }
  if (signedName.length < 2 || !body?.agreed) {
    return NextResponse.json({ error: "Type your name and accept the agreement to sign." }, { status: 400 });
  }

  // Parse the customer-typed full address into city/state/zip so the CRM
  // route card AND the generated invoice reflect exactly what the customer
  // entered (not just the free-text street line). Best-effort: if parsing
  // fails we keep the structured city/state/zip already on the lead.
  function parseAddress(full) {
    const text = String(full || "").trim();
    const m = text.match(/\b([A-Za-z]{2})\b\s+(\d{5})(?:[-\s]\d{4})?\s*$/);
    if (m) {
      const zip = m[2];
      const state = m[1].toUpperCase();
      const head = text.slice(0, m.index).trim();
      let city = "";
      const c = head.match(/([A-Za-z .'-]+?)\s+[A-Za-z]{2}\s+\d{5}$/);
      if (c) city = c[1].trim();
      else {
        const comma = head.lastIndexOf(",");
        if (comma >= 0) city = head.slice(comma + 1).trim();
        else city = head;
      }
      return { city: city || null, state, zip };
    }
    return null;
  }
  const oa = parseAddress(originAddress);
  const da = parseAddress(destAddress);

  try {
    const pool = getPool();
    const lead = await fetchByToken(pool, params.token);
    if (!lead) return NextResponse.json({ error: "This booking link is invalid or expired." }, { status: 404 });
    // Already signed and nothing changed -> nothing to do. If details changed
    // (contract_dirty), allow a re-sign as a change order.
    if (lead.signed_at && !lead.contract_dirty) {
      return NextResponse.json({ error: "This agreement has already been signed." }, { status: 409 });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      null;

    await pool.query(
      `update leads set
         origin_address = $1, destination_address = $2,
         origin_city = coalesce($10, origin_city), origin_state = coalesce($11, origin_state), origin_zip = coalesce($12, origin_zip),
         destination_city = coalesce($13, destination_city), destination_state = coalesce($14, destination_state), destination_zip = coalesce($15, destination_zip),
         signed_name = $3, signed_at = now(), signed_ip = $4,
         pickup_contact = coalesce($6, pickup_contact),
         pickup_phone = coalesce($7, pickup_phone),
         delivery_contact = coalesce($8, delivery_contact),
         delivery_phone = coalesce($9, delivery_phone),
         contract_dirty = false,
         status = case when status in ('quoted','contacted','assigned') then 'booked' else status end,
         secondary_status = coalesce(secondary_status, 'Searching For Carriers'),
         closed_at = coalesce(closed_at, now()),
         sale_amount = coalesce(sale_amount, total_tariff)
       where id = $5`,
      [originAddress, destAddress, signedName, ip, lead.id, pickupContact, pickupPhone, deliveryContact, deliveryPhone,
        oa?.city || null, oa?.state || null, oa?.zip || null,
        da?.city || null, da?.state || null, da?.zip || null]
    );

    // Chain of custody: every signing (initial or change-order re-sign) is
    // appended to signature_history with a snapshot of the agreed terms.
    // Best-effort — a missing table must never block the customer's booking.
    try {
      await logSignature(pool, {
        leadId: lead.id,
        signerName: signedName,
        ip,
        kind: lead.signed_at ? "change_order" : "initial",
        contractSnapshot: {
          total_tariff: lead.total_tariff,
          origin_address: originAddress,
          destination_address: destAddress,
          phone: lead.phone,
        },
      });
    } catch {
      // history table unavailable — the lead row still holds the latest signature
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
