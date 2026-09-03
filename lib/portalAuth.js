// Shared auth helpers for the tenant portal API routes. A request is a valid
// tenant when its Supabase Auth session token resolves to an email that
// matches a tenants.contact_email row. Public signups are disabled on the
// Supabase project, so tenant users are provisioned by the platform admin.

export async function getAuthedEmail(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.email?.toLowerCase() || null;
  } catch {
    return null;
  }
}

export async function resolveTenant(pool, email) {
  const { rows } = await pool.query(
    `select id, company_name, plan_type, plan_tier, status
     from tenants where lower(contact_email) = $1 limit 1`,
    [email]
  );
  return rows[0] || null;
}
