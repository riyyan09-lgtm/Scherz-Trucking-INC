// One-click unsubscribe endpoint (RFC 8058 / Gmail-Yahoo 2024 bulk-sender
// rules). The quote email carries a List-Unsubscribe header pointing here; the
// mail client POSTs List-Unsubscribe=One-Click and we mark the lead so it
// stops receiving customer emails. We never block on DB failure.
import { NextResponse } from "next/server";
import { getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = new URL(req.url).searchParams.get("t");
  let status = "ok";
  if (token) {
    try {
      await getPool().query(
        "update leads set do_not_email = true where booking_token = $1",
        [token]
      );
    } catch {
      status = "error";
    }
  } else {
    status = "missing";
  }
  const html =
    `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribed</title>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"></head>` +
    `<body style="font-family:system-ui,sans-serif;background:#0f1115;color:#e8e8e8;` +
    `display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
    `<div style="text-align:center;max-width:420px;padding:32px">` +
    `<h2 style="color:#a78bfa">You've been unsubscribed</h2>` +
    `<p>We won't send marketing emails to this address. You can still be contacted ` +
    `directly by your agent about active shipments.</p>` +
    `</div></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(req) {
  const token = new URL(req.url).searchParams.get("t");
  if (token) {
    try {
      await getPool().query(
        "update leads set do_not_email = true where booking_token = $1",
        [token]
      );
    } catch {
      /* best-effort */
    }
  }
  // RFC 8058: respond 200 to the one-click POST.
  return new NextResponse(null, { status: 200 });
}
