// CRM email notifications, sent via Resend with plain fetch (same pattern as
// lib/notify.js). Both fail silently: email trouble must never block a lead
// update. The scherztruckinginc.com domain is verified in Resend, so customer mail
// delivers from the branded quotes@scherztruckinginc.com address.
import { recordComms } from "./comms";

// scherztruckinginc.com is now verified in Resend, so we can send FROM it (branded).
// The SENDER DISPLAY NAME is the tenant's company name so the customer sees
// that brand. Override per-deployment with RESEND_FROM if a reseller wants a
// different verified sending identity.
const VERIFIED_FROM_DOMAIN = "scherztruckinginc.com";

// Builds the From header: uses RESEND_FROM (a verified domain) when set,
// otherwise the verified scherztruckinginc.com domain with the tenant's company name
// as the display name so the email reads as coming from that tenant.
function fromFor(companyName) {
  if (process.env.RESEND_FROM) return process.env.RESEND_FROM;
  const name = (companyName || "Scherz Trucking INC").replace(/"/g, "");
  return `${name} <quotes@${VERIFIED_FROM_DOMAIN}>`;
}

async function send(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error("[crmEmails] RESEND_API_KEY missing — email not sent"); return false; }
  try {
    // Never send an empty/undefined reply_to — Resend rejects it and would
    // fail the whole send. Drop optional fields when falsy.
    const clean = { ...payload };
    if (!clean.reply_to) delete clean.reply_to;
    if (!clean.html) delete clean.html;
    const body = JSON.stringify({ from: payload.from || fromFor(), ...clean });
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[crmEmails] Resend rejected email:", res.status, txt);
    }
    return res.ok;
  } catch (e) {
    console.error("[crmEmails] email send threw:", e.message);
    return false;
  }
}

function money(n) {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

function vehicleLines(lead) {
  if (Array.isArray(lead.vehicles) && lead.vehicles.length > 0) {
    return lead.vehicles.map((v) => [v.year, v.make, v.model].filter(Boolean).join(" ")).join(", ");
  }
  return [lead.vehicle_year, lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(" ") || "your vehicle";
}

// To the customer when their lead is marked "quoted".
export async function sendQuoteEmail({ lead, companyName, agentName, agentEmail, tariff }) {
  if (!lead?.email) return false;
  const route = `${[lead.origin_city, lead.origin_state].filter(Boolean).join(", ") || "your pickup location"} to ${[lead.destination_city, lead.destination_state].filter(Boolean).join(", ") || "your destination"}`;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scherztruckinginc.com";
  const unsubUrl = `${baseUrl}/api/unsubscribe?t=${encodeURIComponent(lead.booking_token || "")}`;
  const vehicles = vehicleLines(lead);
  const pickup = lead.pickup_date ? String(lead.pickup_date).slice(0, 10) : null;
  const deposit = money(Math.round(tariff * 0.15));
  const companyAddr = "13151 Emily Rd Suite#210 - D, Dallas, TX 75240"; // CAN-SPAM physical address (Nest Auto Transport)
  const replyTo = agentEmail || `quotes@${VERIFIED_FROM_DOMAIN}`;

  const text = [
    `Hi ${lead.name || "there"},`,
    "",
    `Thanks for requesting a quote with ${companyName}. Here it is:`,
    "",
    `  Route: ${route}`,
    `  Vehicle(s): ${vehicles}`,
    pickup ? `  Requested pickup: ${pickup}` : null,
    `  Total price: ${money(tariff)}`,
    "",
    `A ${companyName} reservation deposit of ${deposit} holds your spot and locks in this price while we assign a carrier. The remaining balance is due at pickup or delivery — never before your vehicle is on the truck.`,
    "Reply to this email or call us to place the deposit and confirm your shipment — quotes reflect current carrier availability and can change with demand.",
    "",
    `${agentName ? `${agentName}, ` : ""}${companyName}`,
    "",
    `---`,
    `You're receiving this because you requested a quote from ${companyName}.`,
    `Unsubscribe / stop these emails: ${unsubUrl}`,
    `${companyName} · ${companyAddr}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your quote</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e3e6ea">
        <tr><td style="background:#1457d6;padding:20px 28px;color:#fff;font-size:20px;font-weight:bold">${companyName}</td></tr>
        <tr><td style="padding:28px">
          <p style="margin:0 0 14px;font-size:16px">Hi ${lead.name || "there"},</p>
          <p style="margin:0 0 18px;font-size:15px;color:#333">Thanks for requesting a quote with ${companyName}. Here are the details:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;color:#222;border-collapse:collapse">
            <tr><td style="padding:8px 0;font-weight:bold;width:42%">Route</td><td style="padding:8px 0">${route}</td></tr>
            <tr><td style="padding:8px 0;font-weight:bold">Vehicle(s)</td><td style="padding:8px 0">${vehicles}</td></tr>
            ${pickup ? `<tr><td style="padding:8px 0;font-weight:bold">Requested pickup</td><td style="padding:8px 0">${pickup}</td></tr>` : ""}
            <tr><td style="padding:8px 0;font-weight:bold">Total price</td><td style="padding:8px 0;font-size:18px;font-weight:bold;color:#1457d6">${money(tariff)}</td></tr>
          </table>
          <div style="margin:20px 0;padding:16px;background:#eef4ff;border-left:4px solid #1457d6;border-radius:6px;font-size:14px;color:#333">
            A ${companyName} reservation deposit of <b>${deposit}</b> holds your spot and locks in this price while we assign a carrier. The remaining balance is due at pickup or delivery — never before your vehicle is on the truck.
          </div>
          <p style="font-size:14px;color:#444;margin:0 0 22px">Reply to this email or call us to place the deposit and confirm your shipment. Quotes reflect current carrier availability and can change with demand.</p>
          <p style="font-size:14px;color:#333;margin:0">${agentName ? `${agentName}, ` : ""}${companyName}</p>
        </td></tr>
        <tr><td style="background:#fafafa;border-top:1px solid #e3e6ea;padding:16px 28px;font-size:12px;color:#777;line-height:1.6">
          You're receiving this because you requested a quote from ${companyName}.<br>
          <a href="${unsubUrl}" style="color:#1457d6">Unsubscribe from these emails</a><br>
          ${companyName} · ${companyAddr}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const ok = await send({
    from: fromFor(companyName),
    to: [lead.email],
    reply_to: replyTo,
    subject: `Your car shipping quote — ${money(tariff)} (${companyName})`,
    text,
    html,
  });
  // Phase 5 comms tracking — best-effort, never blocks the send result.
  recordComms({
    leadId: lead.id,
    channel: "email",
    to_address: lead.email,
    template: "quote",
    status: ok ? "sent" : "failed",
  }).catch(() => {});
  return ok;
}

// To the agent when a lead is assigned to them (auto-rotation or admin handoff).
export async function sendAgentAssignmentEmail({ agentEmail, agentName, leadId, companyName }) {
  if (!agentEmail) return false;
  const crmUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://scherztruckinginc.com"}/crm`;
  return send({
    to: [agentEmail],
    subject: `You have been assigned a new lead in Scherz Trucking CRM: #${leadId}`,
    text: [
      `Hi ${agentName || "there"},`,
      "",
      `Lead #${leadId} has been assigned to you by the automated lead assignment engine at ${companyName}.`,
      "",
      `Open your worklist: ${crmUrl}`,
      "",
      "— Scherz Trucking CRM",
    ].join("\n"),
  });
}
