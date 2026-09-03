"use client";

import { createClient } from "@supabase/supabase-js";

// One Supabase client PER PORTAL, each with its own storage key. This is
// what lets the platform admin (/admin) and a tenant (/portal) be signed in
// simultaneously in the same browser: with a shared key (the old setup),
// signing into one portal silently replaced the other's session, which
// surfaced as "I got signed out after one action".
const clients = {};

export function getSupabase(scope = "portal") {
  if (!clients[scope]) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) return null; // not configured -- callers show an error state
    clients[scope] = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: `sg-${scope}-auth`,
      },
    });
  }
  return clients[scope];
}

// Returns a currently-valid access token for the scope, forcing a refresh
// when the cached one is expired or about to expire.
export async function getFreshToken(scope = "portal") {
  const supabase = getSupabase(scope);
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data?.session;
  if (!session) return null;
  const expiresIn = (session.expires_at || 0) * 1000 - Date.now();
  if (expiresIn > 60_000) return session.access_token;
  const { data: refreshed } = await supabase.auth.refreshSession();
  return refreshed?.session?.access_token || session.access_token;
}

// "Stay signed in" support, tracked per scope. Unchecked sessions survive
// reloads in the same tab but end when the site next opens in a fresh tab.
export function applyStaySignedIn(stay, scope = "portal") {
  try {
    if (stay) {
      localStorage.removeItem(`sg-${scope}-ephemeral`);
    } else {
      localStorage.setItem(`sg-${scope}-ephemeral`, "1");
      sessionStorage.setItem(`sg-${scope}-alive`, "1");
    }
  } catch {
    // storage unavailable -- default persistent behavior applies
  }
}

export async function enforceStaySignedIn(scope = "portal") {
  try {
    if (localStorage.getItem(`sg-${scope}-ephemeral`) !== "1") return false;
    if (sessionStorage.getItem(`sg-${scope}-alive`)) return false; // same tab
    localStorage.removeItem(`sg-${scope}-ephemeral`);
    await getSupabase(scope)?.auth.signOut();
    return true;
  } catch {
    return false;
  }
}
