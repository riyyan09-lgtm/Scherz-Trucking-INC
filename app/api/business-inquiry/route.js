import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";
import { notifyBusinessInquiry } from "../../../lib/notify";
import { BUSINESS_SEGMENT_SLUGS } from "../../../lib/businessSegments";

export const dynamic = "force-dynamic";

// Derived from the segment list rather than hardcoded: an unknown segment is
// rejected with a 400 below, so a newly added business page whose slug wasn't
// added here would render correctly and then fail silently on submit.
const SEGMENTS = BUSINESS_SEGMENT_SLUGS;

function isValidPhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}
function isValidEmail(raw) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw || "");
}

// POST /api/business-inquiry — the "request a business account" form on the
// 3 B2B pages. Just emails the inquiry (see lib/notify.js) — these aren't
// car-shipping quotes, so they don't go through the leads table/routing.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { segment, name, company, phone, email, message } = body || {};
  if (!SEGMENTS.includes(segment)) return NextResponse.json({ error: "Invalid segment" }, { status: 400 });
  if (!name || !String(name).trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!isValidPhone(phone)) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });
  if (email && !isValidEmail(email)) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const clean = {
    segment,
    name: String(name).trim().slice(0, 200),
    company: company ? String(company).trim().slice(0, 200) : null,
    phone: String(phone).trim().slice(0, 40),
    email: email ? String(email).trim().slice(0, 200) : null,
    message: message ? String(message).trim().slice(0, 2000) : null,
  };

  // Persist first — this is the source of truth admin sees. Email is a
  // best-effort notification and must never be allowed to lose the lead.
  try {
    const pool = getPool();
    await pool.query(
      `insert into business_inquiries (segment, name, company, phone, email, message)
       values ($1, $2, $3, $4, $5, $6)`,
      [clean.segment, clean.name, clean.company, clean.phone, clean.email, clean.message]
    );
  } catch {
    // DB write failed — still try to notify so a human can follow up.
  }

  try {
    await notifyBusinessInquiry(clean);
  } catch {
    // Notification failures should never block or fail the form submission.
  }

  return NextResponse.json({ success: true });
}
