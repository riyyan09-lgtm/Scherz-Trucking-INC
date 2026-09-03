"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase, getFreshToken, applyStaySignedIn, enforceStaySignedIn } from "../../lib/supabaseBrowser";
import LeadManagementPanel from "./LeadManagementPanel";
import "./portal.css";

// Inline 20px line icons for the collapsing sidebar.
const IC = (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
const ICON = {
  dashboard: IC(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>),
  agents: IC(<><circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16 3.5a3.5 3.5 0 0 1 0 7M21.5 21a6.5 6.5 0 0 0-5-6.3"/></>),
  leadmgmt: IC(<><path d="M8 3v18M16 3v18"/><path d="M4 8l4-4 4 4M20 16l-4 4-4-4"/></>),
  signout: IC(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>),
  chevron: IC(<path d="M15 6l-6 6 6 6"/>),
};

// Tenant-facing dashboard, built from reference/tenant-dashboard-design.html.
// The signed-in tenant's plan decides which view renders:
//   blue_pill — compact pages-by-state row, one-row ad self-service
//   red_pill  — today's lead counter vs quota + delivered-leads feed
// Ad self-service only ever *requests* a launch (pending_launch + AI action
// queue) — nothing spends money without human approval.

const PLATFORMS = [
  { value: "google_ads", label: "Google Ads" },
  { value: "meta", label: "Meta (Facebook & Instagram)" },
  { value: "microsoft_ads", label: "Microsoft Ads (Bing)" },
  { value: "tiktok", label: "TikTok Ads" },
];

function timeFmt(iso) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function vehicleSummary(l) {
  if (Array.isArray(l.vehicles) && l.vehicles.length > 0) {
    const list = l.vehicles.map((v) => [v.year, v.make, v.model].filter(Boolean).join(" ")).join("; ");
    return l.vehicles.length > 1 ? `${list} (${l.vehicles.length} vehicles)` : list;
  }
  return [l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).join(" ");
}

// Lead-drop feed shared by both plan views. Assignment is automatic —
// leads round-robin to the tenant's active reps as they drop — so the feed
// shows WHO has each lead rather than a picker.
function LeadFeed({ leads, emptyText }) {
  if (!leads || leads.length === 0) {
    return <div className="tp-empty">{emptyText}</div>;
  }
  return leads.map((l) => (
    <div className="drop-feed-item" key={l.id}>
      <div>
        <div className="name">{l.name} · {l.phone}</div>
        <div className="meta">
          {[l.origin_city, l.origin_state].filter(Boolean).join(", ") || "?"} → {[l.destination_city, l.destination_state].filter(Boolean).join(", ") || "?"}
          {vehicleSummary(l) ? ` · ${vehicleSummary(l)}` : ""} · {l.service}
        </div>
      </div>
      <div className="tp-feed-right">
        <span className={`tp-agent-badge ${l.agent_name ? "ok" : ""}`}>
          {l.agent_name || "Awaiting rep"}
        </span>
        <div className="time">{timeFmt(l.created_at)}</div>
      </div>
    </div>
  ));
}
function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Agents section: manage reps and the tenant-wide assignment cap.
function AgentsPanel({ agentsData, getToken, onChanged }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [cap, setCap] = useState("");
  const [period, setPeriod] = useState("day");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showAdd, setShowAdd] = useState(false); // Add-agent modal
  const [statsAgent, setStatsAgent] = useState(null); // { id, name }
  const [statsData, setStatsData] = useState(null);
  const [statsPeriod, setStatsPeriod] = useState("month");
  const [statsBusy, setStatsBusy] = useState(false);

  async function openAgentStats(a) {
    setStatsAgent({ id: a.id, name: a.name });
    setStatsData(null);
    setStatsBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/portal/agents/${a.id}/stats?period=${statsPeriod}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) setStatsData((await res.json()).stats);
    } catch { /* non-critical */ }
    finally { setStatsBusy(false); }
  }
  async function changeStatsPeriod(p) {
    setStatsPeriod(p);
    if (!statsAgent) return;
    setStatsBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/portal/agents/${statsAgent.id}/stats?period=${p}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) setStatsData((await res.json()).stats);
    } catch { /* non-critical */ }
    finally { setStatsBusy(false); }
  }

  useEffect(() => {
    if (agentsData) {
      setCap(agentsData.cap ?? "");
      setPeriod(agentsData.period || "day");
    }
  }, [agentsData]);

  async function api(method, body) {
    const token = await getToken();
    const res = await fetch("/api/portal/agents", {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "Request failed");
    return out;
  }

  const run = (fn) => async (...args) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn(...args);
      await onChanged();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const saveCap = run(async () => {
    await api("PATCH", { cap: cap || null, period });
    setMsg({ ok: true, text: cap ? `Saved — max ${cap} leads per rep per ${period}.` : "Saved — no cap." });
  });
  const addAgent = run(async () => {
    if (!form.name || !form.email) throw new Error("Agent name and email are required");
    if (form.password && form.password.length < 8) throw new Error("Agent password must be at least 8 characters");
    const out = await api("POST", form);
    setForm({ name: "", email: "", phone: "", password: "" });
    setShowAdd(false);
    setMsg({
      ok: true,
      text: out.crm_login
        ? `Agent added. CRM login${out.crm_login.custom ? " (your password)" : " (copy now — shown once)"}: ${out.crm_login.email} / ${out.crm_login.password} — they sign in at /crm`
        : `Agent added. ${out.note || ""}`,
    });
  });
  const toggleAgent = run(async (a) => api("PATCH", { id: a.id, active: !a.active }));
  const resetPassword = run(async (a) => {
    const out = await api("PATCH", { id: a.id, reset_password: true });
    setMsg({ ok: true, text: `New CRM password for ${a.name} (copy now — shown once): ${a.email} / ${out.new_password}` });
  });
  const deleteAgent = run(async (id) => {
    await api("DELETE", { id });
    setConfirmDelete(null);
  });

  const agents = agentsData?.agents || [];
  // Current calendar month/year — never hardcoded; the broker-fee figures the
  // API returns are scoped to date_trunc('month'/'year', now()) to match.
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const yearNum = now.getFullYear();

  return (
    <>
      <div className="tp-section-head page-head">
        <h2>Agents</h2>
        <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="count">{agents.length} total</span>
          <button onClick={() => { setMsg(null); setShowAdd(true); }}>+ Add Agent</button>
        </span>
      </div>

      <div className="tp-section">
        <div className="tp-section-head"><h2>Assignment limit</h2><span className="count">applies to every rep</span></div>
        <div className="tp-one-row tp-agents-cap">
          <span className="tp-cap-label">Assign at most</span>
          <input type="number" min="1" placeholder="No cap" value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Max leads per rep" />
          <span className="tp-cap-label">leads to a single rep per</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Cap period">
            <option value="day">day</option>
            <option value="week">week</option>
          </select>
          <button className="request-btn" disabled={busy} onClick={saveCap}>Save</button>
        </div>
      </div>

      {msg && <p className={`tp-msg ${msg.ok ? "ok" : "err"}`} style={{ margin: "0 0 16px" }}>{msg.text}</p>}

      {agentsData?.tenantSummary && (
        <div className="tp-summary-grid">
          <div className="tp-sum-card"><span className="tp-sum-l">Refunds This Month</span><span className="tp-sum-v">${Number(agentsData.tenantSummary.refunds_month || 0).toLocaleString()}</span></div>
          <div className="tp-sum-card"><span className="tp-sum-l">Chargebacks This Month</span><span className="tp-sum-v">${Number(agentsData.tenantSummary.chargebacks_month || 0).toLocaleString()}</span></div>
          <div className="tp-sum-card"><span className="tp-sum-l">Orders Converted</span><span className="tp-sum-v">{Number(agentsData.tenantSummary.orders_converted || 0)}</span></div>
          <div className="tp-sum-card"><span className="tp-sum-l">Broker Fees Earned</span><span className="tp-sum-v">${Number(agentsData.tenantSummary.broker_fees_earned || 0).toLocaleString()}</span></div>
          <div className="tp-sum-card"><span className="tp-sum-l">Net Earnings</span><span className="tp-sum-v">${Number(agentsData.tenantSummary.net_earnings || 0).toLocaleString()}</span></div>
        </div>
      )}

      <div className="tp-agent-grid">
        {agents.map((a) => (
          <div className={`tp-agent-card${a.active ? "" : " is-inactive"}`} key={a.id}>
            <div className="tp-agent-card-head">
              <div className="tp-agent-id">
                <div className="tp-agent-name">{a.name}{!a.active && <span className="tp-inactive"> · deactivated</span>}</div>
                <div className="tp-agent-email">{a.email}</div>
                {a.phone && <div className="tp-agent-phone">{a.phone}</div>}
              </div>
            </div>

            <div className="tp-agent-bf">
              <div className="tp-bf-item">
                <span className="tp-bf-lbl">B.F. Earned in {monthName}</span>
                <span className="tp-bf-val">${Number(a.broker_month || 0).toLocaleString()}</span>
              </div>
              <div className="tp-bf-item">
                <span className="tp-bf-lbl">B.F. Earned in {yearNum}</span>
                <span className="tp-bf-val">${Number(a.broker_year || 0).toLocaleString()}</span>
              </div>
            </div>

            <div className="tp-agent-card-actions">
              <button disabled={busy} onClick={() => openAgentStats(a)}>Stats</button>
              <button disabled={busy} onClick={() => resetPassword(a)}>Reset password</button>
              <button disabled={busy} onClick={() => toggleAgent(a)}>{a.active ? "Deactivate" : "Activate"}</button>
              {confirmDelete === a.id ? (
                <button className="danger" disabled={busy} onClick={() => deleteAgent(a.id)}>Confirm?</button>
              ) : (
                <button className="danger" onClick={() => setConfirmDelete(a.id)}>Remove</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAdd && (
        <div className="tp-modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="tp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal-head">
              <h3>Add an agent</h3>
              <button className="tp-modal-x" onClick={() => setShowAdd(false)} aria-label="Close">×</button>
            </div>
            <div className="tp-modal-body">
              <label className="tp-modal-field"><span>Full name</span>
                <input autoFocus placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="tp-modal-field"><span>Email</span>
                <input type="email" placeholder="rep@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label className="tp-modal-field"><span>Phone <em>(optional)</em></span>
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label className="tp-modal-field"><span>Password <em>(optional — auto-generated if blank)</em></span>
                <input type="text" autoComplete="off" placeholder="Auto-generated if blank" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </label>
            </div>
            <div className="tp-modal-foot">
              <button className="tp-modal-cancel" onClick={() => setShowAdd(false)}>Cancel</button>
              <button className="request-btn" disabled={busy} onClick={addAgent}>Add agent</button>
            </div>
          </div>
        </div>
      )}

      {statsAgent && (
        <div className="tp-modal-overlay" onClick={() => setStatsAgent(null)}>
          <div className="tp-modal tp-stats-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tp-modal-head">
              <h3>Agent Stats — {statsAgent.name}</h3>
              <button className="tp-modal-x" onClick={() => setStatsAgent(null)} aria-label="Close">×</button>
            </div>
            <div className="tp-stats-periods">
              {[["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["year", "This Year"], ["lifetime", "Lifetime"]].map(([p, lbl]) => (
                <button key={p} className={statsPeriod === p ? "active" : ""} onClick={() => changeStatsPeriod(p)}>{lbl}</button>
              ))}
            </div>
            <div className="tp-modal-body">
              {statsBusy && <p className="tp-msg">Loading…</p>}
              {!statsBusy && statsData && (
                <div className="tp-stats-grid">
                  {[
                    ["Leads Assigned", statsData.leads_assigned],
                    ["Leads Contacted", statsData.leads_contacted],
                    ["Quotes Created", statsData.quotes_created],
                    ["Orders Converted", statsData.orders_converted],
                    ["Conversion %", statsData.conversion_pct + "%"],
                    ["Total Revenue", "$" + Number(statsData.total_revenue).toLocaleString()],
                    ["Broker Fees Earned", "$" + Number(statsData.broker_fees_earned).toLocaleString()],
                    ["Broker Fees Collected", "$" + Number(statsData.broker_fees_collected).toLocaleString()],
                    ["Broker Fees Due", "$" + Number(statsData.broker_fees_due).toLocaleString()],
                    ["Refund Total", "$" + Number(statsData.refund_total).toLocaleString()],
                    ["Chargeback Total", "$" + Number(statsData.chargeback_total).toLocaleString()],
                    ["Won Chargebacks", "$" + Number(statsData.won_chargebacks).toLocaleString()],
                    ["Lost Chargebacks", "$" + Number(statsData.lost_chargebacks).toLocaleString()],
                    ["Calls", statsData.calls],
                    ["Texts", statsData.texts],
                    ["Emails", statsData.emails],
                    ["Last Active", statsData.last_active ? String(statsData.last_active).slice(0, 16) : "—"],
                    ["Last Login", statsData.last_login ? String(statsData.last_login).slice(0, 16) : "—"],
                  ].map(([lbl, val]) => (
                    <div className="tp-stat-item" key={lbl}><span className="tp-stat-l">{lbl}</span><span className="tp-stat-v">{val}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function TenantPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [error, setError] = useState(null); // 'login' | 'notenant' | 'db' | null
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [data, setData] = useState(null);

  // one-row ad request
  const [adScope, setAdScope] = useState("state"); // 'state' | 'city'
  const [adTarget, setAdTarget] = useState("");
  const [adPlatform, setAdPlatform] = useState("google_ads");
  const [adBudget, setAdBudget] = useState("");
  const [adMsg, setAdMsg] = useState(null);
  const [adSubmitting, setAdSubmitting] = useState(false);

  // one-row pages-by-state browser
  const [pageStateSel, setPageStateSel] = useState("");

  // self-managed ads ("bring your own ad manager"): tag IDs saved per tenant
  const [adTags, setAdTags] = useState({ ga4_id: "", gads_conversion_id: "", gads_conversion_label: "", meta_pixel_id: "" });
  const [adTagsMsg, setAdTagsMsg] = useState(null);
  const [adTagsBusy, setAdTagsBusy] = useState(false);

  async function loadAdTags() {
    try {
      const token = await getToken();
      const res = await fetch("/api/portal/adsettings", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!res.ok) return;
      const s = (await res.json()).settings || {};
      setAdTags({
        ga4_id: s.ga4_id || "",
        gads_conversion_id: s.gads_conversion_id || "",
        gads_conversion_label: s.gads_conversion_label || "",
        meta_pixel_id: s.meta_pixel_id || "",
      });
    } catch { /* non-critical */ }
  }

  async function saveAdTags() {
    setAdTagsBusy(true); setAdTagsMsg(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/portal/adsettings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(adTags),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Save failed");
      setAdTagsMsg({ ok: true, text: "Saved — these tags now load on every landing page you own (live within ~5 minutes)." });
    } catch (e) {
      setAdTagsMsg({ ok: false, text: e.message });
    } finally {
      setAdTagsBusy(false);
    }
  }

  async function downloadPagesCsv() {
    try {
      const token = await getToken();
      const res = await fetch("/api/portal/pages-export", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `landing-pages-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      setAdTagsMsg({ ok: false, text: "Could not export pages — try again." });
    }
  }

  // portal navigation + agents (CRM-lite)
  const [view, setView] = useState("dashboard"); // 'dashboard' | 'agents'
  const [collapsed, setCollapsed] = useState(false);
  const [agentsData, setAgentsData] = useState(null); // { agents, cap, period }

  async function loadAgents() {
    try {
      const token = await getToken();
      const res = await fetch("/api/portal/agents", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) setAgentsData(await res.json());
    } catch {
      // agents list is non-critical; the feed falls back to a disabled control
    }
  }


  // group owned pages by state for both compact rows
  const byState = useMemo(() => {
    const m = new Map();
    for (const p of data?.pages || []) {
      if (!m.has(p.state)) m.set(p.state, []);
      m.get(p.state).push(p);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  async function fetchStats(token) {
    const res = await fetch("/api/portal/stats", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401) throw new Error("login");
    if (res.status === 403) throw new Error("notenant");
    if (!res.ok) throw new Error("db");
    return res.json();
  }

  async function getToken() {
    return getFreshToken("portal");
  }

  useEffect(() => {
    (async () => {
      try {
        if (await enforceStaySignedIn("portal")) return; // ephemeral session ended
        const token = await getToken();
        if (token) {
          setData(await fetchStats(token));
          loadAgents();
          loadAdTags();
        }
      } catch {
        // fall through to the login form
      } finally {
        setCheckingSession(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = getSupabase("portal");
      if (!supabase) throw new Error("db");
      const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !auth?.session?.access_token) throw new Error("login");
      applyStaySignedIn(staySignedIn, "portal");
      setData(await fetchStats(auth.session.access_token));
      loadAgents();
      loadAdTags();
    } catch (err) {
      setError(["login", "notenant", "db"].includes(err.message) ? err.message : "db");
    } finally {
      setSubmitting(false);
    }
  }

  async function refresh() {
    try {
      const token = await getToken();
      if (token) setData(await fetchStats(token));
    } catch {
      // keep last good data
    }
  }

  async function signOut() {
    try {
      await getSupabase("portal")?.auth.signOut();
    } finally {
      setData(null);
      setPassword("");
    }
  }

  async function requestCampaign() {
    setAdMsg(null);
    if (!adTarget || !(Number(adBudget) > 0)) {
      setAdMsg({ ok: false, text: "Pick a target and set a daily budget." });
      return;
    }
    setAdSubmitting(true);
    try {
      const token = await getToken();
      const body =
        adScope === "state"
          ? { scope: "state", state: adTarget, platform: adPlatform, daily_budget: Number(adBudget) }
          : { scope: "city", page_id: Number(adTarget), platform: adPlatform, daily_budget: Number(adBudget) };
      const res = await fetch("/api/portal/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "failed");
      setAdMsg({ ok: true, text: "Campaign request submitted for review — nothing spends until approved." });
      setAdTarget("");
      setAdBudget("");
      refresh();
    } catch (err) {
      setAdMsg({ ok: false, text: err.message || "Something went wrong — try again." });
    } finally {
      setAdSubmitting(false);
    }
  }

  if (!data) {
    return (
      <div className="tp-login-screen">
        <form className="tp-login-card" onSubmit={tryLogin}>
          <div className="tp-login-logo">
            <img src="/logo.png" alt={BRAND.name} width={32} height={32} className="tp-login-logo-img" />
            <span>{BRAND.name}</span>
          </div>
          <div className="tp-login-sub">Tenant portal — sign in to continue</div>
          <div className="tp-login-field">
            <label>Email</label>
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="tp-login-field">
            <label>Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <label className="stay-signed">
            <input type="checkbox" checked={staySignedIn} onChange={(e) => setStaySignedIn(e.target.checked)} />
            Stay signed in
          </label>
          <button className="tp-login-btn" type="submit" disabled={submitting || checkingSession}>
            {submitting ? "Signing in..." : checkingSession ? "Checking session..." : "Sign in"}
          </button>
          {error === "login" && <p className="tp-msg err">Incorrect email or password.</p>}
          {error === "notenant" && <p className="tp-msg err">This login isn&apos;t linked to a tenant account — contact your Scherz Trucking INC account manager.</p>}
          {error === "db" && <p className="tp-msg err">Service temporarily unreachable — try again in a minute.</p>}
        </form>
      </div>
    );
  }

  const isBlue = data.planType === "blue_pill";
  const shownPages =
    pageStateSel === "ALL" ? data.pages || [] : byState.find(([st]) => st === pageStateSel)?.[1] || [];

  return (
    <div className="tp-root" data-collapsed={collapsed}>
      <aside className="tp-side">
        <div className="tp-side-top">
          <div className="tp-brand"><span className="dot" /><span className="tp-side-label">{data.company}</span></div>
          <button className="tp-side-toggle" aria-label="Collapse menu" onClick={() => setCollapsed((v) => !v)}>{ICON.chevron}</button>
        </div>
        <nav className="tp-side-nav">
          <button className={`tp-side-item ${view === "dashboard" ? "active" : ""}`} onClick={() => { setView("dashboard"); refresh(); }}>
            <span className="tp-side-ico">{ICON.dashboard}</span><span className="tp-side-label">Dashboard</span>
          </button>
          <button className={`tp-side-item ${view === "agents" ? "active" : ""}`} onClick={() => { setView("agents"); loadAgents(); }}>
            <span className="tp-side-ico">{ICON.agents}</span><span className="tp-side-label">Agents</span>
          </button>
          <button className={`tp-side-item ${view === "leadmgmt" ? "active" : ""}`} onClick={() => setView("leadmgmt")}>
            <span className={`tp-side-ico`}>{ICON.leadmgmt}</span><span className="tp-side-label">Lead Management</span>
          </button>
        </nav>
        <div className="tp-side-foot">
          <span className={`plan-badge ${isBlue ? "blue" : "red"}`}>
            {isBlue ? `Software — ${data.planTier}` : `Leads — ${data.planTier}`}
          </span>
          <button className="tp-signout" onClick={signOut}>
            <span className="tp-side-ico">{ICON.signout}</span><span className="tp-side-label">Sign out</span>
          </button>
        </div>
      </aside>

      <div className="tp-body">
        <main className="tp-wrap tp-main">
        {view === "agents" && <AgentsPanel agentsData={agentsData} getToken={getToken} onChanged={loadAgents} />}
        {view === "leadmgmt" && <LeadManagementPanel getToken={getToken} />}
        {view === "dashboard" && (isBlue ? (
          <div className="tp-dash">
            <div className="tp-dash-top">
            <div className="tp-stats">
              <div className="tp-stat-card">
                <div className="lbl">Pages live</div>
                <div className="val">{data.pagesLive}{data.pageAllowance ? ` / ${data.pageAllowance}` : ""}</div>
                <div className="sub">{data.planTier} plan allowance</div>
              </div>
              <div className="tp-stat-card">
                <div className="lbl">Leads this month</div>
                <div className="val">{data.leadsMonth}</div>
                <div className="sub">100% yours — no cap</div>
              </div>
              <div className="tp-stat-card">
                <div className="lbl">Conversion this month</div>
                <div className="val">{data.leadsMonth ? Math.round((data.convertedMonth || 0) / data.leadsMonth * 100) + "%" : "—"}</div>
                <div className="sub">{data.convertedMonth || 0} of {data.leadsMonth || 0} leads booked</div>
              </div>
              <div className="tp-stat-card">
                <div className="lbl">Top state</div>
                <div className="val">{data.topState?.state || "—"}</div>
                <div className="sub">{data.topState ? `${data.topState.n} leads this month` : "no leads yet"}</div>
              </div>
            </div>

            <div className="tp-section">
              <div className="tp-section-head"><h2>Your pages</h2><span className="count">{data.pagesLive} across {byState.length} state{byState.length === 1 ? "" : "s"}</span></div>
              <div className="tp-one-row">
                <select value={pageStateSel} onChange={(e) => setPageStateSel(e.target.value)}>
                  <option value="">Select a state to see your pages…</option>
                  <option value="ALL">All states — {data.pagesLive} pages</option>
                  {byState.map(([st, pages]) => (
                    <option key={st} value={st}>{st} — {pages.length} page{pages.length === 1 ? "" : "s"}</option>
                  ))}
                </select>
              </div>
              <div className={`tp-slide ${pageStateSel ? "open" : ""}`}>
                <div className="tp-chipset">
                  {shownPages.map((p) => (
                    <span className="tp-chip" key={p.id}>
                      {p.city}, {p.state} <b>{p.leads_month}</b> leads
                    </span>
                  ))}
                </div>
              </div>
            </div>
            </div>

            <div className="tp-dash-scroll">
            <div className="tp-section tp-leaddrops">
              <div className="tp-section-head"><h2>Lead drops</h2><span className="count">{(data.recentLeads || []).length} recent</span></div>
              <LeadFeed
                leads={data.recentLeads}
                emptyText="No leads yet — they appear here the moment one of your pages converts."
              />
            </div>
            </div>

            <div className="tp-dash-bottom">
            <div className="tp-section">
              <div className="tp-section-head"><h2>Run ads on your pages</h2><span className="count">whole state or single city</span></div>
              <div className="tp-one-row">
                <select value={adScope} onChange={(e) => { setAdScope(e.target.value); setAdTarget(""); }} aria-label="Ad scope">
                  <option value="state">Whole state</option>
                  <option value="city">Single city</option>
                </select>
                <select value={adTarget} onChange={(e) => setAdTarget(e.target.value)} aria-label="Ad target">
                  <option value="" disabled>{adScope === "state" ? "Choose state" : "Choose city"}</option>
                  {adScope === "state"
                    ? byState.map(([st, pages]) => (
                        <option key={st} value={st}>{st} ({pages.length} page{pages.length === 1 ? "" : "s"})</option>
                      ))
                    : (data.pages || []).map((p) => (
                        <option key={p.id} value={p.id}>{p.city}, {p.state}</option>
                      ))}
                </select>
                <select value={adPlatform} onChange={(e) => setAdPlatform(e.target.value)} aria-label="Ad platform">
                  {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <input
                  type="number"
                  min="1"
                  placeholder="$/day"
                  aria-label="Daily budget"
                  value={adBudget}
                  onChange={(e) => setAdBudget(e.target.value)}
                />
                <button className="request-btn" onClick={requestCampaign} disabled={adSubmitting}>
                  {adSubmitting ? "Submitting..." : "Request launch"}
                </button>
              </div>
              <div className="ad-note" style={{ padding: "0 22px 16px" }}>
                Submits to your account team for review — this doesn&apos;t spend anything until approved.
              </div>
              {adMsg && <p className={`tp-msg ${adMsg.ok ? "ok" : "err"}`} style={{ padding: "0 22px 16px" }}>{adMsg.text}</p>}
            </div>

            <div className="tp-section">
              <div className="tp-section-head">
                <h2>Bring your own ad manager</h2>
                <span className="count">self-managed ads</span>
              </div>
              <div className="ad-note" style={{ padding: "14px 22px 0" }}>
                Hiring your own SEO/ads manager? Paste their tracking IDs below and their tags load on every
                landing page you own — conversions fire automatically when a visitor submits the quote form.
                They run campaigns from their own ad account; nothing here spends money.
              </div>
              <div className="tp-adtags">
                <label><span>Google Ads conversion ID <em>(AW-…)</em></span>
                  <input placeholder="AW-123456789" value={adTags.gads_conversion_id} onChange={(e) => setAdTags({ ...adTags, gads_conversion_id: e.target.value })} />
                </label>
                <label><span>Conversion label</span>
                  <input placeholder="AbCdEfGhIj0KLmNoPq" value={adTags.gads_conversion_label} onChange={(e) => setAdTags({ ...adTags, gads_conversion_label: e.target.value })} />
                </label>
                <label><span>GA4 measurement ID <em>(G-…)</em></span>
                  <input placeholder="G-XXXXXXXXXX" value={adTags.ga4_id} onChange={(e) => setAdTags({ ...adTags, ga4_id: e.target.value })} />
                </label>
                <label><span>Meta pixel ID <em>(optional)</em></span>
                  <input placeholder="1234567890123456" value={adTags.meta_pixel_id} onChange={(e) => setAdTags({ ...adTags, meta_pixel_id: e.target.value })} />
                </label>
              </div>
              <div className="tp-adtags-actions">
                <button className="request-btn" disabled={adTagsBusy} onClick={saveAdTags}>{adTagsBusy ? "Saving…" : "Save tracking IDs"}</button>
                <button className="tp-export-btn" onClick={downloadPagesCsv}>Export my page URLs (CSV)</button>
              </div>
              {adTagsMsg && <p className={`tp-msg ${adTagsMsg.ok ? "ok" : "err"}`} style={{ padding: "0 22px 16px" }}>{adTagsMsg.text}</p>}
            </div>

            {data.campaigns.length > 0 && (
              <div className="tp-section">
                <div className="tp-section-head"><h2>Campaign requests</h2><span className="count">{data.campaigns.length}</span></div>
                {data.campaigns.map((c) => (
                  <div className="page-row" key={c.id}>
                    <div>
                      <div className="loc">
                        {c.city ? `${c.city}, ${c.state}` : `${c.state_name || c.state} — whole state`}
                      </div>
                      <div className="svc">
                        {(PLATFORMS.find((p) => p.value === c.platform)?.label || c.platform || "—")} · ${Number(c.daily_budget)}/day · requested {timeAgo(c.requested_at)}
                      </div>
                    </div>
                    <span className={`ad-status ${c.status}`}>{c.status.replace("_", " ")}</span>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        ) : (
          <div className="tp-dash">
            <div className="tp-section">
              <div className="drop-summary">
                <div className="big">{data.usedToday}{data.leadsPerDay ? ` / ${data.leadsPerDay}` : ""}</div>
                <div className="lbl">leads dropped today</div>
              </div>
              <div className="quota-strip">
                {data.planTier} package{data.leadsPerDay ? ` — ${data.leadsPerDay} leads/day` : ""}{data.leadCap ? ` · ${data.leadCap}/month cap` : ""}{data.pricePerLead ? ` · $${data.pricePerLead}/lead` : ""}
              </div>
            </div>

            <div className="tp-stats" style={{ marginTop: 20 }}>
              <div className="tp-stat-card"><div className="lbl">Leads this month</div><div className="val">{data.usedMonth}{data.leadCap ? ` / ${data.leadCap}` : ""}</div></div>
              <div className="tp-stat-card"><div className="lbl">Conversion this month</div><div className="val">{data.usedMonth ? Math.round((data.convertedMonth || 0) / data.usedMonth * 100) + "%" : "—"}</div><div className="sub">{data.convertedMonth || 0} of {data.usedMonth || 0} leads booked</div></div>
              <div className="tp-stat-card"><div className="lbl">Avg. per day</div><div className="val">{data.avgPerDay}</div></div>
              <div className="tp-stat-card"><div className="lbl">Days remaining</div><div className="val">{data.daysRemaining}</div></div>
            </div>

            <div className="tp-section">
              <div className="tp-section-head"><h2>Lead drops</h2><span className="count">{data.recentLeads.length} recent</span></div>
              <LeadFeed
                leads={data.recentLeads}
                emptyText="No leads delivered yet — they'll appear here the moment one is assigned to you."
              />
            </div>
          </div>
        ))}
        </main>
      </div>
    </div>
  );
}
