// Shared auth for platform-admin API routes: the caller's Supabase Auth
// session token must resolve to a user, and (when ADMIN_EMAILS is set) the
// user's email must be on that allowlist. Public signups are disabled on the
// Supabase project, so only admin-provisioned users can authenticate at all.
// Returns the admin's email (truthy) when authorized, or null.
export async function isAdminRequest(request) {
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
    if (!user?.email) return null;
    const email = user.email.toLowerCase();

    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    return allowlist.length === 0 || allowlist.includes(email) ? email : null;
  } catch {
    return null;
  }
}
