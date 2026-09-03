"use client";

import { useEffect, useState } from "react";
import { getSupabase, getFreshToken, applyStaySignedIn, enforceStaySignedIn } from "../../lib/supabaseBrowser";
import TenantsPanel from "./TenantsPanel";
import ActivityPanel from "./ActivityPanel";
import { QueuePanel, LeadsPanel, MarketplacePanel, BusinessInquiriesPanel } from "./panels";
import "./admin.css";

// Inline 20px line icons (Phosphor-style) for the collapsing sidebar.
const IC = (p) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{p}</svg>;
const ICON = {
  overview: IC(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>),
  queue: IC(<><path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/></>),
  tenants: IC(<><path d="M3 21V8l6-4 6 4v13"/><path d="M15 21V11l6 4v6"/><path d="M8 12h.01M8 16h.01"/></>),
  activity: IC(<path d="M3 12h4l2 6 4-14 2 8h6"/>),
  leads: IC(<><circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M17 8h5M19.5 5.5v5"/></>),
  marketplace: IC(<><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9"/><path d="M3 9h18"/></>),
  signout: IC(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></>),
  chevron: IC(<path d="M15 6l-6 6 6 6"/>),
};

// Real authentication: Supabase Auth (email + password). Public signups are
// disabled on the Supabase project, so only admin-provisioned users get in.
// The stats API independently verifies the session token server-side --
// this component never gates anything by itself.

function timeAgo(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [showRecover, setShowRecover] = useState(false);
  const [error, setError] = useState(null); // null | 'login' | 'db' | 'config'
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [stats, setStats] = useState(null);
  const [view, setView] = useState("overview");
  const [collapsed, setCollapsed] = useState(false);
  const [indexNowMsg, setIndexNowMsg] = useState(null);
  const [indexNowBusy, setIndexNowBusy] = useState(false);
  const [pages, setPages] = useState(null);
  const [pagesMsg, setPagesMsg] = useState(null);
  const [pagesBusy, setPagesBusy] = useState(false);
  const [feedback, setFeedback] = useState([]);
  const [fbReplyId, setFbReplyId] = useState(null);
  const [fbReply, setFbReply] = useState("");
  const [fbBusy, setFbBusy] = useState(false);

  async function loadFeedback() {
    try {
      const token = await getFreshToken("admin");
      if (!token) return;
      const res = await fetch("/api/admin/feedback", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) setFeedback((await res.json()).feedback || []);
    } catch { /* non-critical */ }
  }

  async function updateFeedback(id, patch) {
    setFbBusy(true);
    try {
      const token = await getFreshToken("admin");
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error("Failed");
      await loadFeedback();
      if (patch.admin_reply === undefined) setFbReplyId(null);
    } catch (e) {
      setFbReply(e.message);
    } finally {
      setFbBusy(false);
    }
  }

  async function loadPages() {
    try {
      const token = await getFreshToken("admin");
      const res = await fetch("/api/admin/pages", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (res.ok) setPages((await res.json()).services);
    } catch { /* non-critical */ }
  }
  async function setService(service, action) {
    setPagesBusy(true);
    setPagesMsg(null);
    try {
      const token = await getFreshToken("admin");
      const res = await fetch("/api/admin/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service, action }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Failed");
      setPagesMsg(`${action === "publish" ? "Published" : "Paused"} ${out.changed} pages. Redeploy or wait an hour for them to appear live.`);
      await loadPages();
    } catch (e) {
      setPagesMsg(e.message);
    } finally {
      setPagesBusy(false);
    }
  }

  async function pushIndexNow() {
    setIndexNowBusy(true);
    setIndexNowMsg(null);
    try {
      const token = await getFreshToken("admin");
      const res = await fetch("/api/admin/indexnow", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Failed");
      setIndexNowMsg(`Submitted ${out.submitted} URLs to Bing/Yandex (IndexNow ${out.indexnow_status}).`);
    } catch (e) {
      setIndexNowMsg(e.message);
    } finally {
      setIndexNowBusy(false);
    }
  }

  async function getToken() {
    return getFreshToken("admin");
  }

  // Re-fetch the overview numbers whenever the user navigates back to it,
  // so switching views always shows current data.
  useEffect(() => {
    if (view === "overview" && stats) { refresh(); loadPages(); }
    if (view === "feedback") { loadFeedback(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function fetchStats(accessToken) {
    const res = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res.status === 401) throw new Error("login");
    if (!res.ok) throw new Error("db");
    return res.json();
  }

  // Resume an existing session on page load instead of asking to log in again.
  useEffect(() => {
    (async () => {
      try {
        const supabase = getSupabase("admin");
        if (!supabase) return;
        if (await enforceStaySignedIn("admin")) return; // ephemeral session ended
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          setStats(await fetchStats(data.session.access_token));
        }
      } catch {
        // Session expired or DB briefly unreachable -- fall back to the login form.
      } finally {
        setCheckingSession(false);
      }
    })();
  }, []);

  async function tryLogin(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supabase = getSupabase("admin");
      if (!supabase) throw new Error("config");
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError || !data?.session?.access_token) throw new Error("login");
      applyStaySignedIn(staySignedIn, "admin");
      setStats(await fetchStats(data.session.access_token));
    } catch (err) {
      setError(["login", "db", "config"].includes(err.message) ? err.message : "db");
    } finally {
      setSubmitting(false);
    }
  }

  // Password-independent recovery: the recovery route forcibly resets the admin
  // password and returns a fresh Supabase session, which we adopt as our own.
  async function tryRecover(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: recoveryCode, password: recoveryPassword }),
      });
      const out = await res.json();
      if (!res.ok || !out.access_token) throw new Error(out?.error || "recovery");
      const supabase = getSupabase("admin");
      if (!supabase) throw new Error("config");
      const { error: sessErr } = await supabase.auth.setSession({
        access_token: out.access_token,
        refresh_token: out.refresh_token,
      });
      if (sessErr) throw new Error("recovery");
      // Read the session back from the client so we use the token it actually
      // stored (avoids a stale/echoed token). This is what makes the dashboard
      // render instead of bouncing back to the login form.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error("recovery");
      applyStaySignedIn(staySignedIn, "admin");
      setStats(await fetchStats(token));
    } catch (err) {
      // Surface the real reason (e.g. "Password must be at least 8 characters")
      // instead of a generic bounce.
      setError(err?.message === "recovery" ? "recovery" : err?.message || "recovery");
    } finally {
      setSubmitting(false);
    }
  }

  async function refresh() {
    try {
      const token = await getFreshToken("admin");
      if (token) setStats(await fetchStats(token));
    } catch {
      // keep showing the last good numbers; refresh again later
    }
  }

  async function signOut() {
    try {
      await getSupabase("admin")?.auth.signOut();
    } finally {
      setStats(null);
      setPassword("");
    }
  }

  if (!stats) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={tryLogin}>
          <div className="login-logo"><span className="dot" />Scherz Trucking INC</div>
          <div className="login-sub">Platform admin — sign in to continue</div>
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <label className="stay-signed">
            <input type="checkbox" checked={staySignedIn} onChange={(e) => setStaySignedIn(e.target.checked)} />
            Stay signed in
          </label>
          <button className="login-btn" type="submit" disabled={submitting || checkingSession}>
            {submitting ? "Signing in..." : checkingSession ? "Checking session..." : "Sign in"}
          </button>
          {error === "login" && (
            <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>
              Incorrect email or password.
            </p>
          )}
          {error === "db" && (
            <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>
              Signed in, but the database is unreachable — try again in a minute.
            </p>
          )}
          {error === "config" && (
            <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>
              Auth is not configured — set NEXT_PUBLIC_SUPABASE_URL and
              NEXT_PUBLIC_SUPABASE_ANON_KEY.
            </p>
          )}

          {/* Recovery path lives INSIDE the card (toggle below Sign in). */}
          <button
            type="button"
            className="login-link"
            onClick={() => setShowRecover((v) => !v)}
            style={{ marginTop: 14 }}
          >
            {showRecover ? "Back to password sign in" : "Can't sign in? Use a recovery code"}
          </button>
          {showRecover && (
            <form className="login-recover-form" onSubmit={tryRecover} style={{ marginTop: 12 }}>
              <div className="login-field">
                <label>Recovery code</label>
                <input
                  type="text"
                  value={recoveryCode}
                  autoComplete="off"
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="One-time admin recovery code"
                />
              </div>
              <div className="login-field">
                <label>New password (optional)</label>
                <input
                  type="password"
                  value={recoveryPassword}
                  autoComplete="new-password"
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                  placeholder="Set one so you can sign in normally after"
                />
              </div>
              <button className="login-btn" type="submit" disabled={submitting}>
                {submitting ? "Recovering..." : "Recover & sign in"}
              </button>
              {error === "recovery" && (
                <p style={{ color: "var(--red)", fontSize: 12.5, marginTop: 8 }}>
                  Recovery failed — wrong code, or the password must be at least 8 characters.
                </p>
              )}
            </form>
          )}
        </form>
      </div>
    );
  }

  const pending = stats.pendingActions.length;

  return (
    <div className="admin-root">
      <div className="app-grid" data-collapsed={collapsed}>
        <aside className="sidebar">
          <div className="side-top">
            <div className="logo"><span className="dot" /><span className="nav-label">Scherz Trucking INC</span></div>
            <button className="side-toggle" aria-label="Collapse menu" onClick={() => setCollapsed((v) => !v)}>{ICON.chevron}</button>
          </div>
          <nav className="side-nav">
            {[
              ["overview", "Overview", null],
              ["queue", "AI Action Queue", pending],
              ["tenants", "Tenants", null],
              ["activity", "Activity", null],
              ["leads", "Leads", null],
              ["biz", "Business Inquiries", null],
              ["marketplace", "Marketplace", null],
              ["feedback", "Feedback", stats?.feedback?.open || null],
            ].map(([k, label, count]) => (
              <button
                key={k}
                className={`nav-item ${view === k ? "active" : ""}`}
                onClick={() => setView(k)}
              >
                <span className="nav-ico">{ICON[k]}</span>
                <span className="nav-label">{label}</span>
                {count != null && <span className="nav-count">{count}</span>}
              </button>
            ))}
          </nav>
          <button className="nav-item side-signout" onClick={signOut}>
            <span className="nav-ico">{ICON.signout}</span><span className="nav-label">Sign out</span>
          </button>
        </aside>

        <main className="admin-main">
          {view === "tenants" && <TenantsPanel getToken={getToken} />}
          {view === "activity" && <ActivityPanel getToken={getToken} />}
          {view === "queue" && <QueuePanel getToken={getToken} onChanged={refresh} onOpenFeedback={() => setView("feedback")} />}
          {view === "leads" && <LeadsPanel getToken={getToken} />}
          {view === "biz" && <BusinessInquiriesPanel getToken={getToken} />}
          {view === "marketplace" && <MarketplacePanel getToken={getToken} />}
          {view === "feedback" && (
            <div className="section">
              <div className="section-head"><span>Feedback &amp; Bug Reports</span><span>{feedback.length} total · {feedback.filter((f) => f.status === "new" || f.status === "in_progress").length} open</span></div>
              {feedback.length === 0 ? (
                <div className="aq-reason" style={{ padding: "16px 22px" }}>No feedback submitted yet.</div>
              ) : (
                feedback.map((f) => (
                  <div className="aq-item" key={f.id} style={{ display: "block" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div>
                        <span className="aq-type">{f.agent_name || "Unknown"}</span>
                        <span style={{ marginLeft: 8, color: "var(--faint)", fontSize: 12 }}>{f.company || ""} · {timeAgo(f.created_at)}</span>
                        <div style={{ fontWeight: 600, marginTop: 6 }}>{f.subject}</div>
                        <div className="aq-reason" style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{f.message}</div>
                        {Array.isArray(f.attachments) && f.attachments.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                            {f.attachments.map((a, i) => (
                              <a key={i} href={a.data_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--teal)" }}>{a.name || `attachment ${i + 1}`}</a>
                            ))}
                          </div>
                        )}
                        {f.admin_reply && <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(16,185,129,0.1)", borderRadius: 6, fontSize: 13 }}>Admin: {f.admin_reply}</div>}
                      </div>
                      <div style={{ textAlign: "right", minWidth: 120 }}>
                        <div className={`crm-pill s-${f.status === "resolved" ? "booked" : f.status === "closed" ? "closed" : "move"}`} style={{ display: "inline-block" }}>{f.status}</div>
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                          {fbReplyId === f.id ? (
                            <>
                              <textarea className="crm-input" rows={2} value={fbReply} onChange={(e) => setFbReply(e.target.value)} placeholder="Reply to agent…" />
                              <button className="approve" disabled={fbBusy} onClick={() => updateFeedback(f.id, { admin_reply: fbReply, status: "resolved" })}>Send & Resolve</button>
                              <button className="reject" onClick={() => { setFbReplyId(null); setFbReply(""); }}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="approve" onClick={() => { setFbReplyId(f.id); setFbReply(""); }}>Reply</button>
                              <button className="reject" disabled={fbBusy} onClick={() => updateFeedback(f.id, { status: "in_progress" })}>In Progress</button>
                              <button className="reject" disabled={fbBusy} onClick={() => updateFeedback(f.id, { status: "closed" })}>Close</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {view === "overview" && (<>
          <div className="ov-head">
          <div className="stats">
            {[
              ["Published pages", stats.pagesPublished, "--svc-car"],
              ["Pages producing leads", stats.pagesWithLeads, "--svc-move"],
              ["Leads (24h)", stats.leadsLast24h, "--svc-freight"],
              ["Leads (all time)", stats.leadsTotal, "--svc-boat"],
              ["Active tenants", stats.activeTenants, "--svc-car"],
              ["Pending AI actions", pending, "--svc-move"],
              ["Open Feedback", stats.feedback?.open ?? 0, "--svc-move"],
            ].map(([lbl, val, c]) => (
              <div key={lbl} className="stat-card" style={{ borderLeftColor: `var(${c})` }}><div className="lbl">{lbl}</div><div className="val">{val}</div></div>
            ))}
          </div>
          </div>

          <div className="ov-scroll">
          <div className="ov-row-2">
          <div className="section ov-card">
            <div className="section-head">
              <span>Landing pages</span>
              <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12.5, color: "var(--faint)" }}>publish or pause by service</span>
                <button className="approve" style={{ cursor: "pointer" }} disabled={indexNowBusy} onClick={pushIndexNow}>
                  {indexNowBusy ? "Submitting..." : "Push all pages to Bing/Yandex"}
                </button>
              </span>
            </div>
            {!pages ? (
              <div className="aq-reason" style={{ padding: "16px 22px" }}>Loading pages…</div>
            ) : (
              pages.map((s) => (
                <div className="aq-item" key={s.service}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div className="aq-reason">{s.published || 0} published · {s.paused || 0} paused{s.draft ? ` · ${s.draft} draft` : ""}</div>
                  </div>
                  <div className="aq-actions">
                    {(s.paused || 0) > 0 && <button className="approve" disabled={pagesBusy} onClick={() => setService(s.service, "publish")}>Publish {s.paused}</button>}
                    {(s.published || 0) > 0 && <button className="reject" disabled={pagesBusy} onClick={() => setService(s.service, "pause")}>Pause {s.published}</button>}
                  </div>
                </div>
              ))
            )}
            {pagesMsg && <div className="aq-reason" style={{ padding: "0 22px 16px", color: "var(--teal)", fontWeight: 600 }}>{pagesMsg}</div>}
            {indexNowMsg && <div className="aq-reason" style={{ padding: "0 22px 16px", color: "var(--teal)", fontWeight: 600 }}>{indexNowMsg}</div>}
          </div>

          <div className="section ov-card">
            <div className="section-head"><span>Recent leads</span><span>{stats.leadsTotal} total</span></div>
            {stats.recentLeads.length === 0 ? (
              <div className="aq-reason" style={{ padding: "16px 22px" }}>No leads yet.</div>
            ) : (
              stats.recentLeads.map((l) => {
                const vehicle =
                  Array.isArray(l.vehicles) && l.vehicles.length > 1
                    ? `${[l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).join(" ")} +${l.vehicles.length - 1} more`
                    : [l.vehicle_year, l.vehicle_make, l.vehicle_model].filter(Boolean).join(" ");
                const route = l.origin_state
                  ? `${[l.origin_city, l.origin_state, l.origin_zip].filter(Boolean).join(" ")} → ${[l.destination_city, l.destination_state, l.destination_zip].filter(Boolean).join(" ") || "?"}`
                  : null;
                return (
                  <div className="aq-item" key={l.id}>
                    <div>
                      <span className="aq-type">{l.routing_mode || "unrouted"}</span>
                      <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>
                        {l.name} · <span className="mono">{l.phone}</span>
                      </div>
                      {(vehicle || route) && (
                        <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
                          {[vehicle, route, l.pickup_date ? `pickup ${String(l.pickup_date).slice(0, 10)}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      )}
                      <div className="aq-reason">{l.url_slug || "unknown page"} · {timeAgo(l.created_at)}</div>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--faint)" }}>{l.status}</div>
                  </div>
                );
              })
            )}
          </div>
          </div>
          </div>

          <div className="ov-scroll">
          <div className="ov-row-2">
          <div className="section ov-card">
            <div className="section-head">
              <span>Pages producing leads</span>
              <button className="approve" style={{ cursor: "pointer" }} onClick={refresh}>Refresh</button>
            </div>
            {stats.topPages.length === 0 ? (
              <div className="aq-reason" style={{ padding: "16px 22px" }}>
                No leads captured yet — this fills in as soon as a landing page converts.
              </div>
            ) : (
              stats.topPages.map((p) => (
                <div className="aq-item" key={p.url_slug}>
                  <div>
                    <div className="mono" style={{ fontSize: 12.5 }}>{p.url_slug}</div>
                    <div className="aq-reason">Last lead {timeAgo(p.last_lead_at)}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--teal)" }}>
                    {p.lead_count} {p.lead_count === 1 ? "lead" : "leads"}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="section ov-card">
            <div className="section-head"><span>AI action queue</span><span>{pending} pending</span></div>
            {pending === 0 ? (
              <div className="aq-reason" style={{ padding: "16px 22px" }}>
                Nothing pending. Proposed actions (page publishes, lead routing, ad launches)
                will appear here for approval.
              </div>
            ) : (
              stats.pendingActions.map((item) => (
                <div className="aq-item" key={item.id}>
                  <div>
                    <span className="aq-type">{item.action_type}</span>
                    <div className="mono" style={{ fontSize: 12.5, marginTop: 6 }}>
                      {item.target_table} #{item.target_id}
                    </div>
                    <div className="aq-reason">{item.reasoning}</div>
                    {item.confidence != null && (
                      <div className="mono" style={{ fontSize: 11, color: "var(--faint)", marginTop: 6 }}>
                        confidence {item.confidence}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          </div>
          </div>
          </>)}
        </main>
      </div>
    </div>
  );
}
