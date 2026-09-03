// Sends you an email the moment a lead comes in. Uses Resend
// (resend.com) via a plain fetch call -- no extra npm package needed.
//
// Not configured yet? This silently does nothing rather than breaking lead
// capture -- the lead is already saved to the database by the time this runs.
export async function notifyNewLead({ name, phone, email, serviceName, routingMode, route, pickupDate, vehicle }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFY_EMAIL;
  if (!apiKey || !toEmail) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Scherz Trucking INC <onboarding@resend.dev>", // scherztruckinginc.com must be verified in Resend first
        to: [toEmail],
        subject: `New lead: ${serviceName} — ${name}`,
        text: [
          "New lead just came in.",
          "",
          `Name: ${name}`,
          `Phone: ${phone}`,
          `Email: ${email || "—"}`,
          `Service: ${serviceName}`,
          `Route: ${route || "—"}`,
          `Pickup date: ${pickupDate || "—"}`,
          `Vehicle: ${vehicle || "—"}`,
          `Routing: ${routingMode}`,
          "",
          "Check /admin or your Supabase leads table for full details.",
        ].join("\n"),
      }),
    });
  } catch {
    // Notification failures should never block or fail the lead submission.
  }
}

// B2B inquiry from /car-shipping/dealers, /repair-shops, or /fleet — these
// don't go through the quote-form/lead-routing pipeline (no vehicle/route
// data, not tenant-routed), just an email so a human follows up.
export async function notifyBusinessInquiry({ segment, name, company, phone, email, message }) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.NOTIFY_EMAIL;
  if (!apiKey || !toEmail) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "Scherz Trucking INC <onboarding@resend.dev>",
        to: [toEmail],
        subject: `New business inquiry (${segment}): ${company || name}`,
        text: [
          `New ${segment} business account inquiry.`,
          "",
          `Name: ${name}`,
          `Company: ${company || "—"}`,
          `Phone: ${phone}`,
          `Email: ${email || "—"}`,
          `Message: ${message || "—"}`,
        ].join("\n"),
      }),
    });
  } catch {
    // Notification failures should never block or fail the form submission.
  }
}
