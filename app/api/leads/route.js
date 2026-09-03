import { NextResponse } from "next/server";
import { promises as dns } from "dns";
import { getPool } from "../../../lib/db";
import { routeLead } from "../../../lib/routing";
import { notifyNewLead } from "../../../lib/notify";
import { autoAssignLead } from "../../../lib/autoAssign";

// True when the email's domain actually exists in DNS. Catches typo domains
// like "gmail.comj" (NXDOMAIN) that pass format checks. CRITICAL: this must
// only reject on a definitive "domain does not exist" — any resolver
// problem (timeout, refused, servfail) fails OPEN so we never lose a real
// lead to DNS trouble.
async function emailDomainExists(email) {
  const domain = email.split("@")[1];
  if (!domain) return false;
  const withTimeout = (p) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))]);
  const definitiveNo = (e) => e?.code === "ENOTFOUND" || e?.code === "ENODATA";

  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length > 0) return true;
  } catch (e) {
    if (!definitiveNo(e)) {
      // Resolver unavailable or slow -- try the OS resolver before failing open.
      try {
        await withTimeout(dns.lookup(domain));
        return true;
      } catch (e2) {
        return e2?.code !== "ENOTFOUND"; // reject only on NXDOMAIN
      }
    }
    // definitive "no MX records" -- fall through to the A-record check
  }
  try {
    const a = await withTimeout(dns.resolve4(domain));
    return a.length > 0;
  } catch (e) {
    if (definitiveNo(e)) return false;
    try {
      await withTimeout(dns.lookup(domain));
      return true;
    } catch (e2) {
      return e2?.code !== "ENOTFOUND";
    }
  }
}

// POST /api/leads
// Called by the quote form on every landing page.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    phone,
    email,
    service_slug,
    origin_state,
    origin_zip,
    origin_city,
    destination_state,
    destination_zip,
    destination_city,
    pickup_date,
    transport_type,
    vehicle_year,
    vehicle_make,
    vehicle_model,
    vehicles,
    vehicle_type,
    cargo_type,
    cargo_weight_lbs,
    container_size,
    timeline,
    source_page_id, // which page this came from -- also tells us the tenant
    tenant_id, // resolved server-side in production; accepted here for now
    lead_source, // e.g. "chatbot" -- optional, defaults to the quote form's implicit "web"
    notes, // optional free text (e.g. a chat transcript summary) stored on internal_notes
  } = body;

  if (!name || !phone || !service_slug) {
    return NextResponse.json(
      { error: "name, phone, and service_slug are required" },
      { status: 400 }
    );
  }

  if (email && !(await emailDomainExists(email))) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // Multi-vehicle support: accept a vehicles array (no UI limit; 100 caps
  // abuse), keeping the first vehicle in the legacy single columns.
  const vehicleList = (Array.isArray(vehicles) ? vehicles : [])
    .slice(0, 100)
    .map((v) => ({
      year: Number(v?.year) || null,
      make: typeof v?.make === "string" ? v.make.slice(0, 60) : null,
      model: typeof v?.model === "string" ? v.model.slice(0, 60) : null,
      inoperable: !!v?.inoperable,
      condition: v?.inoperable && typeof v?.condition === "string" ? v.condition.slice(0, 60) : null,
    }))
    .filter((v) => v.year || v.make || v.model);
  const firstVehicle = vehicleList[0] || { year: vehicle_year || null, make: vehicle_make || null, model: vehicle_model || null };

  const pool = getPool();

  const svcResult = await pool.query("select id, name from services where slug = $1", [service_slug]);
  if (svcResult.rows.length === 0) {
    return NextResponse.json({ error: `Unknown service_slug: ${service_slug}` }, { status: 400 });
  }
  const serviceId = svcResult.rows[0].id;
  const serviceName = svcResult.rows[0].name;

  const routing = await routeLead(pool, { tenantId: tenant_id || null, serviceId });
  // Blue pill: keeps the original tenant_id (the page owner).
  // Red pill: routeLead picks which tenant gets it -- use that instead.
  const finalTenantId = routing.assignedTenantId ?? (tenant_id || null);

  const insertResult = await pool.query(
    `insert into leads
      (source_page_id, tenant_id, service_id, name, phone, email,
       origin_state, origin_zip, origin_city,
       destination_state, destination_zip, destination_city,
       pickup_date, transport_type, vehicle_year, vehicle_make, vehicle_model, vehicles,
       vehicle_type, cargo_type, cargo_weight_lbs, container_size, timeline,
       routing_mode, overflow_reason, gclid, utm_source, utm_medium, utm_campaign, status,
       lead_source, internal_notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,'new',$30,$31)
     returning id`,
    [
      source_page_id || null,
      finalTenantId,
      serviceId,
      name,
      phone,
      email || null,
      origin_state || null,
      origin_zip || null,
      origin_city || null,
      destination_state || null,
      destination_zip || null,
      destination_city || null,
      pickup_date || null,
      transport_type === "Enclosed" ? "Enclosed" : "Open",
      firstVehicle.year,
      firstVehicle.make,
      firstVehicle.model,
      vehicleList.length > 0 ? JSON.stringify(vehicleList) : null,
      vehicle_type || null,
      cargo_type || null,
      cargo_weight_lbs || null,
      container_size || null,
      timeline || null,
      routing.routing_mode,
      routing.overflow_reason,
      // Ad attribution (self-managed ads): which click/campaign produced this
      // lead. Length-capped; free text is fine — never interpolated into HTML.
      typeof body.gclid === "string" ? body.gclid.slice(0, 200) : null,
      typeof body.utm_source === "string" ? body.utm_source.slice(0, 120) : null,
      typeof body.utm_medium === "string" ? body.utm_medium.slice(0, 120) : null,
      typeof body.utm_campaign === "string" ? body.utm_campaign.slice(0, 120) : null,
      typeof lead_source === "string" ? lead_source.slice(0, 60) : null,
      typeof notes === "string" ? notes.slice(0, 2000) : null,
    ]
  );

  // Round-robin the fresh lead to one of the tenant's reps immediately.
  let assignedAgent = null;
  if (finalTenantId) {
    assignedAgent = await autoAssignLead(pool, insertResult.rows[0].id, finalTenantId);
  }

  // Sync captured vehicles into lead_vehicles so they show in the CRM. Both
  // agent_id and tenant_id are NOT NULL, so this only runs once the lead has
  // been assigned to a rep. Fire-and-forget: never break lead capture.
  if (assignedAgent && finalTenantId && vehicleList.length > 0) {
    try {
      for (let i = 0; i < vehicleList.length; i++) {
        const v = vehicleList[i];
        await pool.query(
          `insert into lead_vehicles (lead_id, agent_id, tenant_id, year, make, model, running, damage_notes, sort_order)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [insertResult.rows[0].id, assignedAgent.id, finalTenantId,
           v.year, v.make, v.model, !v.inoperable, v.condition || null, i]
        );
      }
    } catch { /* vehicle sync is best-effort */ }
  }

  await notifyNewLead({
    name,
    phone,
    email,
    serviceName,
    routingMode: routing.routing_mode,
    route:
      origin_state || destination_state
        ? `${[origin_city, origin_state, origin_zip].filter(Boolean).join(" ") || "?"} → ${[destination_city, destination_state, destination_zip].filter(Boolean).join(" ") || "?"}`
        : null,
    pickupDate: pickup_date || null,
    vehicle:
      vehicleList.length > 0
        ? vehicleList
            .map((v) =>
              [v.year, v.make, v.model].filter(Boolean).join(" ") +
              (v.inoperable ? ` — INOPERABLE${v.condition ? ` (${v.condition})` : ""}` : "")
            )
            .join("; ") + (vehicleList.length > 1 ? ` (${vehicleList.length} vehicles)` : "")
        : [vehicle_year, vehicle_make, vehicle_model].filter(Boolean).join(" ") || null,
  });

  return NextResponse.json({
    success: true,
    lead_id: insertResult.rows[0].id,
    routing_mode: routing.routing_mode,
  });
}
