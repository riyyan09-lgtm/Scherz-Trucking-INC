import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

function supaHeaders(extra) {
  const h = {
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: "Bearer " + process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  if (extra) Object.assign(h, extra);
  return h;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const recovery = process.env.ADMIN_RECOVERY_CODE;
  if (!recovery || body?.code !== recovery) {
    return NextResponse.json({ error: "Invalid recovery code" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!url || !anon || !svc || adminEmails.length === 0) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const listRes = await fetch(url + "/auth/v1/admin/users", {
      headers: supaHeaders(),
      cache: "no-store",
    });
    if (!listRes.ok) {
      const errBody = await listRes.text();
      return NextResponse.json({ error: "Auth service unavailable", detail: errBody.slice(0, 200) }, { status: 503 });
    }
    const users = (await listRes.json()).users || [];
    const admin = users.find((u) => {
      const e = (u.email || "").toLowerCase();
      return adminEmails.includes(e);
    });
    if (!admin) return NextResponse.json({ error: "Admin user not found", found: users.map(u => u.email) }, { status: 404 });

    const provided = typeof body?.password === "string" ? body.password : "";
    let fresh;
    if (provided) {
      if (provided.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      fresh = provided;
    } else {
      fresh = randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) + "Aa1";
    }
    const putRes = await fetch(url + "/auth/v1/admin/users/" + admin.id, {
      method: "PUT",
      headers: supaHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ password: fresh, email_confirm: true }),
    });
    if (!putRes.ok) {
      const errBody = await putRes.text();
      return NextResponse.json({ error: "Failed to reset credentials", detail: errBody.slice(0, 200) }, { status: 503 });
    }

    const tokRes = await fetch(url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: supaHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email: admin.email, password: fresh }),
    });
    if (!tokRes.ok) {
      const errBody = await tokRes.text();
      return NextResponse.json({ error: "Failed to mint session", detail: errBody.slice(0, 200) }, { status: 503 });
    }
    const tok = await tokRes.json();
    return NextResponse.json({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      user: tok.user,
    });
  } catch (err) {
    return NextResponse.json({ error: "Recovery failed", detail: err?.message }, { status: 503 });
  }
}
