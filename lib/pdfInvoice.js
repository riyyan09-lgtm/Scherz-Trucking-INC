import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { DEFAULT_BOX } from "./invoiceTokens";
export { INVOICE_TOKENS } from "./invoiceTokens";

function loc(city, st, zip) {
  return [[city, st].filter(Boolean).join(", "), zip].filter(Boolean).join(" ") || "—";
}
function fullAddress(addr1, addr2, city, st, zip) {
  const line1 = [addr1, addr2].filter(Boolean).join(" ");
  // The customer types the FULL address (incl. city/state/zip) into the
  // booking form, so origin_address already contains the whole location.
  // Use it verbatim — never append the parsed city/state/zip on top, or we
  // get the doubled "Madison, AL 35758, 35758" / mismatched-zip invoice bug.
  // Fall back to the structured city/state/zip only when no street line exists.
  if (line1) return line1;
  const locStr = [[city, st].filter(Boolean).join(", "), zip].filter(Boolean).join(" ");
  return locStr || "—";
}
function dateOnly(v) {
  return v ? String(v).slice(0, 10) : "—";
}
function money(v) {
  return v != null ? "$" + Number(v).toFixed(2) : "—";
}

function vehSummary(vehicles) {
  if (!vehicles || vehicles.length === 0) return "—";
  const first = [vehicles[0].year, vehicles[0].make, vehicles[0].model].filter(Boolean).join(" ");
  return vehicles.length > 1 ? `${first} +${vehicles.length - 1}` : first || "—";
}
// What the customer/agent recorded about drivability, mirroring
// CrmPortal.js's Runs/Inop badge — `running` is a real boolean column on
// lead_vehicles, not inferred.
function vehCondition(v) {
  if (!v) return "—";
  if (v.running) return "Operable";
  return v.damage_notes || "Inoperable";
}

// Per-vehicle field value, shared between the single-row token map below
// (always vehicles[0], unchanged behavior) and fillPdfTemplate's repeat-row
// path (one call per vehicle row for a field with repeatRows > 1).
function vehicleFieldValue(v, token) {
  switch (token) {
    case "vehicle_year": return v?.year != null ? String(v.year) : "—";
    case "vehicle_make": return v?.make || "—";
    case "vehicle_model": return v?.model || "—";
    case "vehicle_type": return v?.type || "—";
    case "vehicle_running": return v ? (v.running ? "Yes" : "No") : "—";
    case "vehicle_condition": return vehCondition(v);
    default: return null;
  }
}

// Mirrors app/crm/CrmPortal.js renderInvoice()'s broker-fee math, using the
// committed `lead` row (server-side, so it's always the saved state — no
// client "draft" overlay to reconcile). Vehicles live in a separate
// lead_vehicles table (not leads.vehicles), so they're passed in separately
// — fetched by the caller via GET /api/crm/vehicles's query, ordered the
// same way (sort_order) so vehicles[0] matches what the CRM shows as the
// order's first vehicle. Covers both the legacy Scherz Trucking INC broker-invoice
// tokens and the shipping-order-form token set.
export function buildTokenValues(lead, tenant, agent, vehicles = []) {
  const t = lead.total_tariff != null && lead.total_tariff !== "" ? Number(lead.total_tariff) : null;
  const bf = t != null && lead.carrier_pay != null && lead.carrier_pay !== "" && Number(lead.carrier_pay) <= t
    ? Math.max(0, t - Number(lead.carrier_pay)) : null;
  const collected = Number(lead.broker_collected || 0);
  const due = bf != null ? Math.max(0, bf - collected) : null;
  const status = lead.broker_payment_status || (bf == null ? "—" : due <= 0 ? "Paid" : collected > 0 ? "Partial" : "Unpaid");
  const deposit = lead.deposit != null && lead.deposit !== "" ? Number(lead.deposit) : null;
  const balance = t != null ? Math.max(0, t - (deposit || 0)) : null;
  const v0 = vehicles[0] || null;

  // Booking/sign URL for the QR code (permanent signed-document link). The
  // QR image itself is generated in the request handler (async) and merged
  // into `values` there, since the qrcode package is asynchronous.
  const bookingUrl = lead.booking_token ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://scherztruckinginc.com"}/book/${lead.booking_token}` : "—";
  const signed_at = lead.signed_at ? new Date(lead.signed_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) + " PST" : "—";
  // Deterministic, non-cryptographic fingerprint of the order for the
  // "Digital Fingerprint Checksum" strip — stable per order, not random.
  const checksum = (() => {
    const seed = `${lead.id}:${lead.booking_token || ""}:${lead.total_tariff || ""}`;
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const b64 = Buffer.from(h.toString(16).padStart(8, "0") + seed).toString("base64");
    return b64;
  })();

  return {
    // Customer
    customer_name: lead.name || "—",
    customer_phone: lead.phone || "—",
    customer_email: lead.email || "—",
    customer_signature: lead.signed_name || "—",
    // Pickup
    pickup_contact: lead.pickup_contact || lead.name || "—",
    pickup_phone: lead.pickup_phone || lead.phone || "—",
    pickup_address: fullAddress(lead.origin_address, lead.origin_address2, lead.origin_city, lead.origin_state, lead.origin_zip),
    // Dropoff
    dropoff_contact: lead.delivery_contact || lead.name || "—",
    dropoff_phone: lead.delivery_phone || lead.phone || "—",
    dropoff_address: fullAddress(lead.destination_address, lead.destination_address2, lead.destination_city, lead.destination_state, lead.destination_zip),
    // Shipment
    trailer_type: lead.transport_type || "—",
    shipping_method: lead.transport_type ? `${lead.transport_type} Trailer` : "—",
    load_date: dateOnly(lead.pickup_date),
    delivery_date: dateOnly(lead.desired_delivery_date),
    // Vehicle (first vehicle on the order, by sort_order -- a field with
    // repeatRows set draws every vehicle instead, see fillPdfTemplate)
    vehicle_year: vehicleFieldValue(v0, "vehicle_year"),
    vehicle_make: vehicleFieldValue(v0, "vehicle_make"),
    vehicle_model: vehicleFieldValue(v0, "vehicle_model"),
    vehicle_type: vehicleFieldValue(v0, "vehicle_type"),
    vehicle_running: vehicleFieldValue(v0, "vehicle_running"),
    vehicle_condition: vehicleFieldValue(v0, "vehicle_condition"),
    // Order / payment
    order_number: lead.order_number || lead.id || "—",
    order_date: dateOnly(lead.quoted_at || lead.created_at),
    invoice_date: new Date().toISOString().slice(0, 10),
    invoice_total: money(t),
    deposit_due: money(deposit),
    balance_due: money(balance),

    // New certificate-style fields (Nest-style agreement layout)
    company_name: tenant?.company_name || "Nest Auto Transport",
    company_address: tenant?.company_address || "13151 Emily Rd Suite#210 - D, Dallas, TX 75240",
    company_phone: tenant?.company_phone || "4692421658",
    payment_method: lead.payment_method || "Not provided yet",
    payment_due_when: deposit && deposit > 0 ? "By Credit Card When Placing Order" : "On Delivery",
    special_terms: lead.special_terms || "—",
    signed_ip: lead.signed_ip || "—",
    signed_at,
    booking_url: bookingUrl,
    doc_checksum: checksum,

    // Legacy Scherz Trucking INC broker-invoice tokens (kept for existing mappings)
    agent_name: agent?.name || "—",
    agent_phone: agent?.phone || "—",
    order_id: lead.order_number || lead.id || "—",
    origin: loc(lead.origin_city, lead.origin_state, lead.origin_zip),
    destination: loc(lead.destination_city, lead.destination_state, lead.destination_zip),
    vehicle: vehSummary(vehicles),
    pickup_date: dateOnly(lead.pickup_date),
    total_amount: money(t),
    broker_fee: money(bf),
    amount_paid: money(collected),
    broker_due: money(due),
    payment_status: status,
  };
}

const DEFAULT_TEXT_COLOR = rgb(0.09, 0.09, 0.12);

// "#RRGGBB" -> pdf-lib rgb() (0-1 per channel). Falls back to the default
// ink color for anything unset/malformed rather than failing the invoice.
function parseHexColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return DEFAULT_TEXT_COLOR;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function drawBoxText(page, font, text, f, width, height) {
  const maxFontSize = f.fontSize || 10;
  const wPct = f.wPct || DEFAULT_BOX.w;
  const hPct = f.hPct || DEFAULT_BOX.h;
  const boxW = wPct * width;
  const boxH = hPct * height;
  let fontSize = Math.min(maxFontSize, Math.max(6, boxH * 0.72));
  while (fontSize > 6 && font.widthOfTextAtSize(text, fontSize) > boxW - 4) {
    fontSize -= 0.5;
  }
  const x = f.xPct * width + 2;
  const yTop = height - f.yPct * height;
  const y = yTop - boxH / 2 - fontSize * 0.36;
  page.drawText(text, { x, y, size: fontSize, font, color: parseHexColor(f.color) });
}

// fields: [{ token, kind: 'coord'|'acroform', page, xPct, yPct, wPct, hPct,
//   fontSize, fieldName, color, repeatRows, rowStepPct }]
// - 'coord' fields draw text directly onto the page inside a box at
//   xPct/yPct/wPct/hPct (fractions of page width/height from the TOP-LEFT,
//   matching the visual mapper) — this never touches existing page content,
//   so layout/branding is untouched, and the result is inherently
//   non-editable (no form fields are involved). Text shrinks to fit the
//   box width, single line, vertically centered in the box. Fields saved
//   before box-drawing existed (or placed with a plain click) have no
//   wPct/hPct — those fall back to DEFAULT_BOX, the exact same size the
//   mapper's preview uses for them, so fill always matches what was mapped.
//   `color` is an optional "#RRGGBB" (defaults to near-black ink).
// - a vehicle_* field with `repeatRows > 1` draws one row per vehicle
//   (up to repeatRows, capped to how many vehicles the order actually has)
//   instead of a single row for vehicles[0] — each row offset down the
//   page by `rowStepPct` (a fraction of page height) from the last.
// - 'acroform' fields set an existing PDF form field's value by name. If any
//   are used, the form is flattened afterward so the filled values become
//   permanent, non-editable page content — same guarantee as the coord path.
export async function fillPdfTemplate(pdfBytes, fields, values, vehicles = []) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();
  let usedAcroForm = false;

  for (const f of fields || []) {
    if (f.kind === "acroform" && f.fieldName) {
      const text = String(values[f.token] ?? "—");
      try {
        const form = pdfDoc.getForm();
        const field = form.getTextField(f.fieldName);
        field.setText(text);
        usedAcroForm = true;
      } catch {
        // Field missing/renamed on this PDF — skip rather than fail the whole invoice.
      }
      continue;
    }
    const page = pages[f.page || 0];
    if (!page) continue;
    const { width, height } = page.getSize();

    const isRepeatingVehicleRow = f.token.startsWith("vehicle_") && Number(f.repeatRows) > 1;
    if (isRepeatingVehicleRow) {
      const rows = Math.min(Number(f.repeatRows), vehicles.length || 1);
      const step = Number(f.rowStepPct) || 0;
      for (let i = 0; i < rows; i++) {
        const text = String(vehicles[i] ? vehicleFieldValue(vehicles[i], f.token) : "—");
        drawBoxText(page, font, text, { ...f, yPct: f.yPct + i * step }, width, height);
      }
      continue;
    }

    const text = String(values[f.token] ?? "—");
    drawBoxText(page, font, text, f, width, height);
  }

  if (usedAcroForm) {
    try {
      const form = pdfDoc.getForm();
      form.flatten();
    } catch {
      // Nothing to flatten.
    }
  }

  return pdfDoc.save();
}

// Inspect an uploaded PDF for existing AcroForm fields (e.g. a tenant's
// carrier-management-software export that already has fillable form
// fields). Returns [] for a plain/flat PDF like a scanned or exported
// document — those get the coordinate-overlay treatment instead.
export async function detectAcroFormFields(pdfBytes) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    return fields.map((f) => ({
      name: f.getName(),
      type: f.constructor?.name?.replace("PDF", "") || "Field",
    }));
  } catch {
    return [];
  }
}
